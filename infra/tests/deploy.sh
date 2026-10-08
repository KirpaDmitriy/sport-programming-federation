#!/usr/bin/env bash
# Exercise the real archive/upload entrypoint against an unguarded historical ref.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
export FSP_RELEASE_ROOT="$fixture/host"
export FSP_SSH_CONFIG="$fixture/ssh-config"
mkdir -p "$fixture/bin" "$fixture/repo/"{infra,backend,frontend,mock-server} "$FSP_RELEASE_ROOT/releases/current"
cp -r "$here" "$FSP_RELEASE_ROOT/releases/current/infra"
mkdir -p "$FSP_RELEASE_ROOT/releases/current/backend/crates/storage-postgres/migrations"
echo sqlx-forward-additive-v1 > "$FSP_RELEASE_ROOT/releases/current/backend/ROLLBACK_COMPATIBLE"
echo 'SELECT 1;' > "$FSP_RELEASE_ROOT/releases/current/backend/crates/storage-postgres/migrations/0001_initial.sql"
ln -s "$FSP_RELEASE_ROOT/releases/current" "$FSP_RELEASE_ROOT/current"
cat > "$fixture/bin/scp" <<'STUB'
#!/usr/bin/env bash
set -eu
args=("$@")
source="${args[${#args[@]}-2]}"
target="${args[${#args[@]}-1]}"
cp "$source" "${target#*:}"
STUB
cat > "$fixture/bin/ssh" <<'STUB'
#!/usr/bin/env bash
set -eu
while [[ "$1" != bash ]]; do shift; done
exec "$@"
STUB
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH"
cd "$fixture/repo"
git init -q
git config user.email fixture@example.com
git config user.name Fixture
mkdir -p backend/crates/storage-postgres/migrations
echo 'SELECT 1;' > backend/crates/storage-postgres/migrations/0001_initial.sql
# A legacy script must never get control, including before it acquires its own lock.
cat > infra/release.sh <<'STUB'
#!/usr/bin/env bash
touch "$FSP_RELEASE_ROOT/unsafe-activation"
STUB
touch frontend/.keep mock-server/.keep
git add .
git commit -qm 'Historical release without a schema guard'
if bash "$here/deploy.sh" HEAD > "$fixture/output" 2>&1; then
  echo 'Expected historical deployment rejection' >&2; exit 1
fi
[[ ! -f "$FSP_RELEASE_ROOT/unsafe-activation" ]]
[[ "$(readlink "$FSP_RELEASE_ROOT/current")" == "$FSP_RELEASE_ROOT/releases/current" ]]
[[ "$(cat "$fixture/output")" == *'target predates forward-migration support'* ]]
echo 'PASS: deploy entrypoint rejects an unguarded historical archive before activation'
