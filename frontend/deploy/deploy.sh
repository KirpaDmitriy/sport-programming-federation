#!/usr/bin/env bash
# Ships a git ref to the demo stand, builds it there and activates it:
#   frontend/deploy/deploy.sh [ref]          (default: main)
# FSP_DEPLOY_HOST and FSP_SSH_CONFIG select the SSH target (defaults use .fsp-infra/).
set -euo pipefail

REF="${1:-main}"
HOST="${FSP_DEPLOY_HOST:-fsp-demo}"
cd "$(git rev-parse --show-toplevel)"
SSH_CONFIG="${FSP_SSH_CONFIG:-.fsp-infra/ssh/config}"
SHA="$(git rev-parse --verify "$REF^{commit}")"
ARCHIVE="$(mktemp --suffix=.tar.gz)"
trap 'rm -f "$ARCHIVE"' EXIT

git archive --format=tar.gz -o "$ARCHIVE" "$SHA" frontend mock-server
scp -q -F "$SSH_CONFIG" "$ARCHIVE" "$HOST:/tmp/fsp-$SHA.tar.gz"
ssh -F "$SSH_CONFIG" "$HOST" "set -euo pipefail
  dir=/opt/fsp/releases/$SHA
  rm -rf \"\$dir\" && mkdir -p \"\$dir\"
  tar -xzf /tmp/fsp-$SHA.tar.gz -C \"\$dir\" && rm -f /tmp/fsp-$SHA.tar.gz
  bash \"\$dir/frontend/deploy/release.sh\" $SHA"
