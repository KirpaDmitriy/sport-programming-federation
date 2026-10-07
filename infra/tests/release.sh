#!/usr/bin/env bash
# Exercise actual release control flow with isolated paths and failing host-command substitutes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
export FSP_RELEASE_ROOT="$fixture/fsp" FSP_SYSTEM_ROOT="$fixture/system" FSP_RUSTUP_ROOT="$fixture/rustup"
export FSP_TEST_COMMANDS="$fixture/commands"
mkdir -p "$fixture/bin" "$FSP_RELEASE_ROOT/releases" "$FSP_SYSTEM_ROOT/etc/"{fsp,systemd/system,nginx/sites-available,nginx/snippets}
export PATH="$fixture/bin:$PATH"
printf 'rust\n' > "$FSP_SYSTEM_ROOT/etc/fsp/api-backend"
printf 'FSP_PUBLIC_WEB_URL=https://192.0.2.1\n' > "$FSP_SYSTEM_ROOT/etc/fsp/rust-api.env"
old=1111111111111111111111111111111111111111
new=2222222222222222222222222222222222222222
export FSP_TEST_NEW="$new"

cat > "$fixture/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FSP_TEST_COMMANDS"
if [[ "$1" == is-active ]]; then exit 0; fi
if [[ "${FSP_TEST_FAIL:-}" == restart && "$1" == restart && ! -f "$FSP_RELEASE_ROOT/failed-once" ]]; then
  touch "$FSP_RELEASE_ROOT/failed-once"
  exit 1
fi
STUB
cat > "$fixture/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -eu
if [[ "${FSP_TEST_FAIL:-}" == health && "$(readlink -f "$FSP_RELEASE_ROOT/current")" == "$FSP_RELEASE_ROOT/releases/$FSP_TEST_NEW" ]]; then exit 1; fi
STUB
cat > "$fixture/bin/nginx" <<'STUB'
#!/usr/bin/env bash
set -eu
if [[ "${FSP_TEST_FAIL:-}" == nginx && ! -f "$FSP_RELEASE_ROOT/failed-once" ]]; then
  touch "$FSP_RELEASE_ROOT/failed-once"
  exit 1
fi
STUB
cat > "$fixture/bin/bun" <<'STUB'
#!/usr/bin/env bash
set -eu
if [[ "${FSP_TEST_FAIL:-}" == build ]]; then exit 1; fi
if [[ "$*" == 'run build' ]]; then mkdir -p dist; echo built > dist/index.html; fi
STUB
cat > "$fixture/bin/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
mkdir -p "$FSP_RUSTUP_ROOT/toolchains/1.99.0-x86_64-unknown-linux-gnu/bin"
cat > "$FSP_RUSTUP_ROOT/toolchains/1.99.0-x86_64-unknown-linux-gnu/bin/cargo" <<'STUB'
#!/usr/bin/env bash
set -eu
# Concurrent builds would collide here if the host lock did not protect the whole build.
mkdir "$FSP_RELEASE_ROOT/building"
/bin/sleep 0.1
mkdir -p "$CARGO_TARGET_DIR/release"
printf '#!/bin/sh\nexit 0\n' > "$CARGO_TARGET_DIR/release/fsp-career-api"
rmdir "$FSP_RELEASE_ROOT/building"
STUB
chmod +x "$fixture/bin/"* "$FSP_RUSTUP_ROOT/toolchains/1.99.0-x86_64-unknown-linux-gnu/bin/cargo"

make_release() {
  local dir="$1"
  mkdir -p "$dir/"{frontend/dist,mock-server,backend,bin}
  cp -r "$HERE" "$dir/infra"
  echo '<main>fixture</main>' > "$dir/frontend/dist/index.html"
  echo 'channel = "1.99.0"' > "$dir/backend/rust-toolchain.toml"
  printf '#!/bin/sh\nexit 0\n' > "$dir/bin/fsp-career-api"
  chmod +x "$dir/bin/fsp-career-api"
}
reset_previous() {
  ln -sfn "$FSP_RELEASE_ROOT/releases/$old" "$FSP_RELEASE_ROOT/current"
  echo old-nginx > "$FSP_SYSTEM_ROOT/etc/nginx/sites-available/fsp-demo.conf"
  echo old-unit > "$FSP_SYSTEM_ROOT/etc/systemd/system/fsp-api.service"
  rm -f "$FSP_RELEASE_ROOT/failed-once" "$FSP_TEST_COMMANDS"
}
make_release "$FSP_RELEASE_ROOT/releases/$old"
make_release "$FSP_RELEASE_ROOT/releases/$new"
reset_previous

bash "$HERE/release.sh" "$old"
[[ ! -f "$FSP_TEST_COMMANDS" ]]
[[ -f "$FSP_RELEASE_ROOT/releases/$old/frontend/dist/index.html" ]]
echo 'PASS: active SHA is not rebuilt or restarted'

for failure in restart health nginx; do
  reset_previous
  if FSP_TEST_FAIL="$failure" bash "$HERE/release.sh" "$new" > "$fixture/output" 2>&1; then
    echo "Expected $failure failure" >&2; exit 1
  fi
  [[ "$(readlink -f "$FSP_RELEASE_ROOT/current")" == "$FSP_RELEASE_ROOT/releases/$old" ]]
  [[ "$(cat "$FSP_SYSTEM_ROOT/etc/nginx/sites-available/fsp-demo.conf")" == old-nginx ]]
  [[ "$(cat "$FSP_SYSTEM_ROOT/etc/systemd/system/fsp-api.service")" == old-unit ]]
  echo "PASS: $failure restores release, nginx and unit"
done

stage="$FSP_RELEASE_ROOT/releases/.staging-test"
make_release "$stage"
third=3333333333333333333333333333333333333333
if FSP_TEST_FAIL=build bash "$HERE/release.sh" "$third" "$stage" > "$fixture/output" 2>&1; then exit 1; fi
[[ ! -d "$FSP_RELEASE_ROOT/releases/$third" ]]
[[ "$(readlink -f "$FSP_RELEASE_ROOT/current")" == "$FSP_RELEASE_ROOT/releases/$old" ]]
echo 'PASS: failed build leaves active release intact'

bash "$HERE/release.sh" "$third" "$stage" > "$fixture/first.log" 2>&1 &
first=$!
stage_two="$FSP_RELEASE_ROOT/releases/.staging-two"
make_release "$stage_two"
fourth=4444444444444444444444444444444444444444
bash "$HERE/release.sh" "$fourth" "$stage_two" > "$fixture/second.log" 2>&1 &
second=$!
wait "$first"
wait "$second"
[[ -f "$FSP_RELEASE_ROOT/current/frontend/dist/index.html" ]]
[[ ! -d "$FSP_RELEASE_ROOT/building" ]]
echo 'PASS: overlapping builds serialize and activate complete releases'

# Older releases remain usable during pruning.
for n in {5..9}; do
  printf -v sha '%040d' "$n"
  make_release "$FSP_RELEASE_ROOT/releases/$sha"
done
bash "$HERE/release.sh" "$old" >/dev/null
[[ -d "$FSP_RELEASE_ROOT/releases/$old" ]]
[[ -d "$FSP_RELEASE_ROOT/releases/$fourth" || -d "$FSP_RELEASE_ROOT/releases/$third" ]]
echo 'PASS: rollback target and previous active release survive retention'
