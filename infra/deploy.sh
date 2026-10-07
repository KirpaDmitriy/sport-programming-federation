#!/usr/bin/env bash
# Ships a git ref to the demo stand, builds it there and activates it:
#   infra/deploy.sh [ref]          (default: main)
# FSP_DEPLOY_HOST and FSP_SSH_CONFIG select the SSH target (defaults use .fsp-infra/).
set -euo pipefail

REF="${1:-main}"
DEPLOY_HOST="${FSP_DEPLOY_HOST:-fsp-demo}"
cd "$(git rev-parse --show-toplevel)"
SSH_CONFIG="${FSP_SSH_CONFIG:-.fsp-infra/ssh/config}"
SHA="$(git rev-parse --verify "$REF^{commit}")"
ARCHIVE="$(mktemp --suffix=.tar.gz)"
REMOTE_ARCHIVE="/tmp/fsp-$SHA-${ARCHIVE##*/}"
trap 'rm -f "$ARCHIVE"' EXIT

git archive --format=tar.gz -o "$ARCHIVE" "$SHA" frontend mock-server backend infra
scp -q -F "$SSH_CONFIG" "$ARCHIVE" "$DEPLOY_HOST:$REMOTE_ARCHIVE"
ssh -F "$SSH_CONFIG" "$DEPLOY_HOST" bash -s -- "$SHA" "$REMOTE_ARCHIVE" <<'REMOTE'
set -euo pipefail
sha="$1"
archive="$2"
stage="$(mktemp -d /opt/fsp/releases/.staging-XXXXXXXX)"
trap 'rm -f "$archive"; rm -rf "$stage"' EXIT
chmod 755 "$stage"
tar -xzf "$archive" -C "$stage"
bash "$stage/infra/release.sh" "$sha" "$stage"
REMOTE
