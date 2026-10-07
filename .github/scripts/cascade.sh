#!/usr/bin/env bash
# Merge only a verified, unchanged PR head; required gates do not depend on repository admin settings.
set -euo pipefail
: "${REPO:?}" "${HEAD_REF:?}" "${BASE_REF:?}" "${PR_NUMBER:?}"
case "$BASE_REF" in
  danil|dima) next=dev ;;
  dev) next=main ;;
  main) next='' ;;
  *) echo "No cascade for base $BASE_REF"; exit 0 ;;
esac

case "$HEAD_REF" in
  danil|dima|dev|main) ;;
  *)
    # Deletion may already have been performed by GitHub's merged-branch setting.
    gh api -X DELETE "repos/$REPO/git/refs/heads/$HEAD_REF" --silent \
      || echo "Feature branch $HEAD_REF was already removed or could not be deleted"
    ;;
esac
[[ -n "$next" ]] || exit 0

pr="$(gh pr list --repo "$REPO" --base "$next" --head "$BASE_REF" --state open --json number --jq '.[0].number // empty')"
if [[ -z "$pr" ]]; then
  gh pr create --repo "$REPO" --base "$next" --head "$BASE_REF" \
    --title "Merge $BASE_REF into $next" \
    --body "Integration after #$PR_NUMBER. Merge requires successful platform, backend, Docker and release-safety checks on the unchanged PR head."
  pr="$(gh pr list --repo "$REPO" --base "$next" --head "$BASE_REF" --state open --json number --jq '.[0].number // empty')"
fi
[[ "$pr" =~ ^[0-9]+$ ]]
sha="$(gh pr view --repo "$REPO" "$pr" --json headRefOid --jq .headRefOid)"

for _ in {1..180}; do
  current="$(gh pr view --repo "$REPO" "$pr" --json headRefOid --jq .headRefOid)"
  [[ "$current" == "$sha" ]] || { echo 'PR changed while checks were running; a fresh cascade must verify it' >&2; exit 1; }
  # gh returns nonzero while checks are pending or failed. Parse its structured result instead.
  checks="$(gh pr checks --repo "$REPO" "$pr" --json name,bucket 2>/dev/null || true)"
  if jq -e 'type == "array" and length > 0' <<< "$checks" >/dev/null 2>&1; then
    if jq -e 'any(.[]; .bucket == "fail" or .bucket == "cancel")' <<< "$checks" >/dev/null; then
      echo 'A required or additional check failed; leaving the PR open' >&2
      exit 1
    fi
    if jq -e '
      . as $checks |
      all(["verify", "check", "compose", "release-safety"][];
        . as $name | any($checks[]; .name == $name and .bucket == "pass"))
      and all($checks[]; .bucket == "pass" or .bucket == "skipping")
    ' <<< "$checks" >/dev/null; then
      gh pr merge --repo "$REPO" "$pr" --merge --match-head-commit "$sha"
      exit 0
    fi
  fi
  sleep 10
done
echo 'Timed out waiting for all required checks; leaving the PR open' >&2
exit 1
