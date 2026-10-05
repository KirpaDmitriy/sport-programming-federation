#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8010}"
health_json="$(curl --fail --silent --show-error "$BASE_URL/api/v1/health")"
home_html="$(curl --fail --silent --show-error "$BASE_URL/")"
session_json="$(curl --fail --silent --show-error "$BASE_URL/api/v1/auth/session")"
matches_json="$(curl --fail --silent --show-error "$BASE_URL/api/v1/vacancies/ml-engineer/matches")"

grep --quiet '"service":"vygotsky"' <<<"$health_json"
grep --quiet "Ищите доказательства" <<<"$home_html"
grep --quiet '"authenticated":false' <<<"$session_json"
grep --quiet '"candidate_id"' <<<"$matches_json"
printf '\nsmoke: ok\n'
