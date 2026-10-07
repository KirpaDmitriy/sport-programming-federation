#!/usr/bin/env bash
# Requires a disposable PostgreSQL test cluster, using the standard PG* connection variables.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d)"
suffix="$(date +%s)_$$"
source_db="fsp_backup_test_$suffix"
restore_db="fsp_restore_test_$suffix"
cleanup() {
  dropdb --if-exists "$source_db"
  dropdb --if-exists "$restore_db"
  rm -rf "$fixture"
}
trap cleanup EXIT
createdb "$source_db"
psql --dbname="$source_db" -v ON_ERROR_STOP=1 -c 'CREATE TABLE backup_probe (id integer PRIMARY KEY); INSERT INTO backup_probe VALUES (42);' >/dev/null
FSP_BACKUP_DIR="$fixture" FSP_BACKUP_DATABASE="$source_db" bash "$HERE/backup-db.sh"
archives=("$fixture"/fsp-*.dump)
[[ "${#archives[@]}" == 1 ]]
[[ "$(stat -c %a "${archives[0]}")" == 600 ]]
createdb "$restore_db"
pg_restore --dbname="$restore_db" --single-transaction --exit-on-error --no-owner "${archives[0]}"
[[ "$(psql --dbname="$restore_db" -Atc 'SELECT id FROM backup_probe')" == 42 ]]
# Failed dumps must neither publish an incomplete archive nor prune the last good one.
if FSP_BACKUP_DIR="$fixture" FSP_BACKUP_DATABASE="${source_db}_missing" bash "$HERE/backup-db.sh" 2>/dev/null; then exit 1; fi
after=("$fixture"/fsp-*.dump)
[[ "${#after[@]}" == 1 && "${after[0]}" == "${archives[0]}" ]]
echo 'PASS: private atomic archive, real restore and failed-backup retention'
