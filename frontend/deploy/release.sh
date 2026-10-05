#!/usr/bin/env bash
# Runs on the host: builds an extracted release, switches /opt/fsp/current atomically and restarts.
set -euo pipefail

SHA="${1:?usage: release.sh <sha>}"
DIR="/opt/fsp/releases/$SHA"
set -a
# shellcheck disable=SC1091
[ -f /etc/fsp/frontend-build.env ] && . /etc/fsp/frontend-build.env
set +a

(cd "$DIR/fsp-frontend-handoff/mock-server" && bun install --frozen-lockfile --production)
(cd "$DIR/frontend" && bun install --frozen-lockfile && bun run build && bun scripts/check-bundle.mjs)

ln -sfn "$DIR" /opt/fsp/current.next
mv -Tf /opt/fsp/current.next /opt/fsp/current
systemctl restart fsp-mock-api
systemctl reload nginx

for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:4010/health > /dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS http://127.0.0.1:4010/health
echo
# Keep the five most recent releases for rollback.
ls -1dt /opt/fsp/releases/* | tail -n +6 | xargs -r rm -rf
echo "Active release: $SHA"
