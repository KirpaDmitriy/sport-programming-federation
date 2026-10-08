#!/usr/bin/env bash
# Run the actual binary's successful extraction probe with the API unit's restrictions.
# Root/systemd required. No application env files, database or LLM are used.
set -euo pipefail
binary="${1:?absolute path to fsp-career-api required}"
[[ "$binary" == /* && -x "$binary" ]] || { echo 'API binary missing' >&2; exit 1; }
here="$(cd "$(dirname "$0")/.." && pwd)"
unit="${2:-$here/fsp-api.service}"
properties=()
section=
while IFS= read -r line; do
  case "$line" in
    '['*']') section="$line" ;;
    ''|'#'*) ;;
    *)
      [[ "$section" == '[Service]' ]] || continue
      case "${line%%=*}" in
        Environment|EnvironmentFile|ExecStart|Restart|RestartSec|StateDirectory) ;;
        *) properties+=(--property="$line") ;;
      esac
      ;;
  esac
done < "$unit"
systemd-run --quiet --wait --pipe --collect --unit="fsp-pdf-probe-$$" \
  "${properties[@]}" "$binary" --check-pdf-runtime
