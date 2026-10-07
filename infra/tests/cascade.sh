#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
export REPO=owner/repo HEAD_REF=danil BASE_REF=dev PR_NUMBER=1
export FSP_TEST_MERGED="$fixture/merged" FSP_TEST_CALLS="$fixture/calls"
mkdir "$fixture/bin"
export PATH="$fixture/bin:$PATH"
cat > "$fixture/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -eu
case "$1 $2" in
  'pr list') echo 2 ;;
  'pr view')
    count="$(cat "$FSP_TEST_CALLS" 2>/dev/null || echo 0)"
    echo "$((count + 1))" > "$FSP_TEST_CALLS"
    if [[ "${FSP_TEST_CHANGED:-}" == 1 && "$count" -gt 0 ]]; then echo new-head; else echo tested-head; fi
    ;;
  'pr checks') printf '%s\n' "$FSP_TEST_CHECKS" ;;
  'pr merge')
    [[ "$*" == *'--match-head-commit tested-head'* ]]
    touch "$FSP_TEST_MERGED"
    ;;
  *) exit 1 ;;
esac
STUB
printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/sleep"
chmod +x "$fixture/bin/"*
export FSP_TEST_CHECKS='[{"name":"verify","bucket":"pass"},{"name":"check","bucket":"pass"},{"name":"compose","bucket":"pass"},{"name":"release-safety","bucket":"pass"}]'
bash "$ROOT/.github/scripts/cascade.sh"
[[ -f "$FSP_TEST_MERGED" ]]
echo 'PASS: complete successful gate set merges only the observed head'
rm "$FSP_TEST_MERGED" "$FSP_TEST_CALLS"
if FSP_TEST_CHANGED=1 bash "$ROOT/.github/scripts/cascade.sh" 2>/dev/null; then exit 1; fi
[[ ! -f "$FSP_TEST_MERGED" ]]
echo 'PASS: a changed head is never merged'
for checks in '[]' '[{"name":"verify","bucket":"pass"}]' '[{"name":"check","bucket":"fail"}]'; do
  rm -f "$FSP_TEST_CALLS"
  if FSP_TEST_CHECKS="$checks" bash "$ROOT/.github/scripts/cascade.sh" 2>/dev/null; then exit 1; fi
  [[ ! -f "$FSP_TEST_MERGED" ]]
done
echo 'PASS: missing, incomplete and failed gates leave the PR open'
