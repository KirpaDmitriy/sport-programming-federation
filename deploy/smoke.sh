#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8010}"
curl --fail --silent --show-error "$BASE_URL/api/v1/health"
curl --fail --silent --show-error "$BASE_URL/" | grep --quiet "Ищите доказательства"
curl --fail --silent --show-error "$BASE_URL/api/v1/auth/session" | grep --quiet '"authenticated":false'
curl --fail --silent --show-error "$BASE_URL/api/v1/vacancies/ml-engineer/matches" | grep --quiet '"candidate_id"'
printf '\nsmoke: ok\n'
