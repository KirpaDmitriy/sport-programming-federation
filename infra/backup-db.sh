#!/usr/bin/env bash
# Run as postgres. Atomic private local archives; off-host copies are an operator responsibility.
set -euo pipefail
umask 077
BACKUP_DIR="${FSP_BACKUP_DIR:-/var/backups/fsp}"
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/backup.lock"
flock -n 9 || exit 0
archive="$(mktemp "$BACKUP_DIR/.backup-XXXXXXXX")"
trap 'rm -f "$archive"' EXIT
pg_dump --dbname="${FSP_BACKUP_DATABASE:-fsp}" --format=custom --no-owner --file="$archive"
pg_restore --list "$archive" >/dev/null
name="fsp-$(date -u +%Y%m%dT%H%M%S)-${archive##*-}.dump"
mv "$archive" "$BACKUP_DIR/$name"
# Prune only complete archives after a new archive is safely published.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'fsp-*.dump' -mtime +14 -delete
echo "Backup created: $name"
