#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/kontur-talent
DATA_DIR=/var/lib/kontur-talent

sudo install -d -o dima -g dima "$APP_DIR" "$DATA_DIR"
cp -R "$SOURCE_DIR/app" "$SOURCE_DIR/deploy" "$APP_DIR/"
cp "$SOURCE_DIR/pyproject.toml" "$SOURCE_DIR/requirements.txt" "$APP_DIR/"

if [[ ! -x "$APP_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$APP_DIR/.venv"
fi
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"
"$APP_DIR/.venv/bin/pip" install --no-deps --editable "$APP_DIR"

sudo install -m 0644 "$SOURCE_DIR/deploy/kontur-talent.service" /etc/systemd/system/kontur-talent.service
sudo systemctl daemon-reload
sudo systemctl enable kontur-talent.service
sudo systemctl restart kontur-talent.service
sudo systemctl status kontur-talent.service --no-pager
