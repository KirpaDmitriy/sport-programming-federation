#!/usr/bin/env bash
# Runs on the host: builds an extracted release, switches /opt/fsp/current atomically and restarts.
# Which API implementation serves :4010 is selected by /etc/fsp/api-backend (mock|rust; default mock).
set -euo pipefail

SHA="${1:?usage: release.sh <sha>}"
DIR="/opt/fsp/releases/$SHA"
IMPL="$(cat /etc/fsp/api-backend 2>/dev/null || echo mock)"
set -a
# shellcheck disable=SC1091
[ -f /etc/fsp/frontend-build.env ] && . /etc/fsp/frontend-build.env
set +a

(cd "$DIR/mock-server" && bun install --frozen-lockfile --production)
(cd "$DIR/frontend" && bun install --frozen-lockfile && bun run build && bun scripts/check-bundle.ts)

# The Rust backend builds on the host once provision.sh installs the toolchain. The build is
# required (and the deploy fails) only while the rust implementation is selected; under mock it
# runs opportunistically so the binary is ready for the cutover.
CARGO_BIN="$(ls -1d /opt/rustup/toolchains/*/bin/cargo 2>/dev/null | head -1 || true)"
if [ "$IMPL" = rust ] && [ -z "$CARGO_BIN" ]; then
  echo "api-backend=rust but no Rust toolchain under /opt/rustup — run provision.sh first" >&2
  exit 1
fi
if [ -n "$CARGO_BIN" ]; then
  # rustc must sit next to cargo on PATH when invoking the toolchain binary directly.
  RUST_BIN_DIR="$(dirname "$CARGO_BIN")"
  (cd "$DIR/backend" && PATH="$RUST_BIN_DIR:$PATH" RUSTUP_HOME=/opt/rustup \
    CARGO_TARGET_DIR=/opt/fsp/target-cache "$CARGO_BIN" build --release --locked -p fsp-server)
  install -D -m 755 /opt/fsp/target-cache/release/fsp-career-api "$DIR/bin/fsp-career-api"
fi

PREV="$(readlink -f /opt/fsp/current 2>/dev/null || true)"
PREV_ACTIVE=fsp-mock-api
systemctl is-active --quiet fsp-api && PREV_ACTIVE=fsp-api
ln -sfn "$DIR" /opt/fsp/current.next
mv -Tf /opt/fsp/current.next /opt/fsp/current
# The units follow the release so path changes ship with the code.
install -m 644 "$DIR/infra/fsp-mock-api.service" /etc/systemd/system/fsp-mock-api.service
install -m 644 "$DIR/infra/fsp-api.service" /etc/systemd/system/fsp-api.service
install -m 644 "$DIR/infra/fsp-cliproxy.service" /etc/systemd/system/fsp-cliproxy.service
install -m 644 "$DIR/infra/fsp-bifrost.service" /etc/systemd/system/fsp-bifrost.service
systemctl daemon-reload

case "$IMPL" in
  rust) active=fsp-api; inactive=fsp-mock-api ;;
  *)    active=fsp-mock-api; inactive=fsp-api ;;
esac
# Only the active implementation may come up after a reboot: both services bind :4010.
systemctl disable --now "$inactive" >/dev/null 2>&1 || true
systemctl enable --now "$active" >/dev/null 2>&1 || true
systemctl restart "$active"
systemctl reload nginx

healthy=""
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4010/health > /dev/null 2>&1 \
    && curl -fsSk -o /dev/null https://127.0.0.1/; then
    healthy=1
    break
  fi
  sleep 0.5
done
if [ -z "$healthy" ]; then
  echo "release $SHA failed health checks on $active" >&2
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" /opt/fsp/current.next
    mv -Tf /opt/fsp/current.next /opt/fsp/current
    systemctl restart "$PREV_ACTIVE" || true
    systemctl reload nginx || true
    echo "rolled back to ${PREV##*/} on $PREV_ACTIVE" >&2
  fi
  exit 1
fi
curl -fsS http://127.0.0.1:4010/health
echo
# Keep the five most recent releases for rollback.
ls -1dt /opt/fsp/releases/* | tail -n +6 | xargs -r rm -rf
echo "Active release: $SHA (api: $IMPL)"
