#!/usr/bin/env bash
# Trusted main only; private inbox credential never reaches pull-request jobs.
set -euo pipefail
export HOME=/var/lib/fsp-ci/home
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
config="${FSP_CI_CONFIG:-/etc/fsp-ci}"
export FSP_PUBLIC_URL FSP_AUTH_MODE FSP_TEST_EMAIL_DOMAIN
FSP_PUBLIC_URL="$(cat "$config/public-url")"
FSP_AUTH_MODE="$(cat "$config/auth-mode")"
FSP_TEST_EMAIL_DOMAIN=auth.nddev.link
export FSP_RESEND_ACCEPTANCE_KEY
FSP_RESEND_ACCEPTANCE_KEY="$(cat "$config/resend-acceptance-key")"
export FSP_DEMO_CODE=123456
base="$FSP_PUBLIC_URL"
curl --fail --silent --show-error -o /dev/null "$base/"
curl --fail --silent --show-error "$base/api/v1/meta"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/v1/session")" == 401 ]]
[[ "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$base/__mock__/session")" == 404 ]]
cd "${1:?checkout required}/frontend"
bun install --frozen-lockfile
bunx playwright install chromium
bun run e2e:public
