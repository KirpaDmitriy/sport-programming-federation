#!/usr/bin/env bash
# Probe the actual proxy: overload must be immediate, structured and retryable.
set -euo pipefail
base="${1:?usage: nginx.sh <base-url>}"
directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
curl --max-time 3 -fsS -D "$directory/headers" -o /dev/null "$base/"
grep -Eqi '^Permissions-Policy:.*camera=\(\), microphone=\(self\), geolocation=\(\)' "$directory/headers"
limited=0
for _ in {1..13}; do
  status="$(curl --max-time 3 -sS -D "$directory/headers" -o "$directory/body" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' -d '{}' "$base/api/v1/auth/email/challenges")"
  if [[ "$status" == 429 ]]; then
    jq -e '.code == "rate_limited" and (.requestId | length > 0) and .details == []' "$directory/body" >/dev/null
    grep -qi '^Retry-After: 60' "$directory/headers"
    limited=1
  fi
done
[[ "$limited" == 1 ]]
# Non-authentication reads do not spend or inherit the anonymous auth budget.
[[ "$(curl --max-time 3 -sS -o /dev/null -w '%{http_code}' "$base/api/v1/meta")" != 429 ]]
echo 'nginx rate limit: immediate 429, JSON envelope, retry hint, scoped budget'
