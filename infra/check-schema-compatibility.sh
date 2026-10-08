#!/usr/bin/env bash
# Binary rollback never rolls back PostgreSQL. All retained schemas must be additive.
set -euo pipefail
previous="${1:?previous release required}"
target="${2:?target release required}"
policy=sqlx-forward-additive-v1
compatible() { [[ "$(cat "$1/backend/ROLLBACK_COMPATIBLE" 2>/dev/null)" == "$policy" ]]; }
reject() { echo "Schema compatibility: $*" >&2; exit 1; }

# Once forward-compatible code has run, PostgreSQL can be ahead of current's
# embedded history. Never return to a strict legacy migrator, even at the same SHA schema.
if compatible "$previous" && ! compatible "$target"; then
  reject 'target predates forward-migration support; use a compatible release'
fi
relative=backend/crates/storage-postgres/migrations
[[ -d "$previous/$relative" && -d "$target/$relative" ]] || reject 'missing migration manifest'
shopt -s nullglob
old_files=("$previous/$relative/"*.sql)
new_files=("$target/$relative/"*.sql)
[[ ${#old_files[@]} -gt 0 && ${#new_files[@]} -gt 0 ]] || reject 'empty migration manifest'
for ((i=0; i<${#old_files[@]} && i<${#new_files[@]}; i++)); do
  [[ "${old_files[i]##*/}" == "${new_files[i]##*/}" ]] || reject 'migration histories must share an ordered prefix'
done
added=0
removed=0
for file in "${old_files[@]}"; do
  other="$target/$relative/${file##*/}"
  if [[ -f "$other" ]]; then
    cmp -s "$file" "$other" || reject "applied migration changed: ${file##*/}"
  else
    removed=1
  fi
done
for file in "${new_files[@]}"; do
  [[ -f "$previous/$relative/${file##*/}" ]] || added=1
done
[[ "$added" == 0 || "$removed" == 0 ]] || reject 'migration histories diverge'
if [[ "$added" == 1 ]] && ! compatible "$previous"; then
  reject 'ship forward-migration support before adding a migration so automatic rollback can start'
fi
if [[ "$removed" == 1 ]] && ! compatible "$target"; then
  reject 'target cannot read the already migrated database'
fi
