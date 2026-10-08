#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  *Username*) echo x-access-token ;;
  *Password*) cat "${FSP_CI_CONFIG:-/etc/fsp-ci}/github-token" ;;
  *) exit 1 ;;
esac
