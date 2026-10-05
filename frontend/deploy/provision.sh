#!/usr/bin/env bash
# Idempotent provisioning of the FSP demo stand on Ubuntu 24.04. Run as root:
#   provision.sh <public-ipv4>
# Installs nginx, pinned Node.js and pnpm, certbot, the mock API unit and an
# IP-address TLS certificate (Let's Encrypt "shortlived" profile, 160 hours).
set -euo pipefail

PUBLIC_IP="${1:?usage: provision.sh <public-ipv4>}"
NODE_VERSION=24.21.0
NODE_SHA256=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
PNPM_VERSION=12.9.1
HERE="$(cd "$(dirname "$0")" && pwd)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq nginx ufw curl xz-utils

if [ "$(/opt/node/bin/node --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  tmp="$(mktemp -d)"
  curl -fsSLo "$tmp/node.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  echo "$NODE_SHA256  $tmp/node.tar.xz" | sha256sum -c -
  mkdir -p "/opt/node-v$NODE_VERSION"
  tar -xJf "$tmp/node.tar.xz" -C "/opt/node-v$NODE_VERSION" --strip-components=1
  ln -sfn "/opt/node-v$NODE_VERSION" /opt/node
  rm -rf "$tmp"
fi
for tool in node npm npx; do ln -sf "/opt/node/bin/$tool" "/usr/local/bin/$tool"; done
if [ "$(pnpm --version 2>/dev/null)" != "$PNPM_VERSION" ]; then
  npm install -g --prefix /opt/pnpm "pnpm@$PNPM_VERSION"
  ln -sf /opt/pnpm/bin/pnpm /usr/local/bin/pnpm
fi

snap install core >/dev/null 2>&1 || true
snap list certbot >/dev/null 2>&1 || snap install --classic certbot
snap refresh certbot >/dev/null 2>&1 || true
ln -sf /snap/bin/certbot /usr/local/bin/certbot

id fsp >/dev/null 2>&1 || useradd --system --home-dir /opt/fsp --shell /usr/sbin/nologin fsp
install -d -m 755 /opt/fsp /opt/fsp/releases /var/www/acme /etc/fsp

ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

cat > /etc/fsp/mock-api.env <<EOF
FSP_MOCK_ALLOWED_ORIGINS=https://$PUBLIC_IP
EOF
# The public stand runs on the synthetic mock: the UI explains that and shows its fixed demo code.
cat > /etc/fsp/frontend-build.env <<EOF
VITE_DEMO_STAND=1
VITE_DEMO_EMAIL_CODE=123456
EOF
install -m 644 "$HERE/fsp-mock-api.service" /etc/systemd/system/fsp-mock-api.service
systemctl daemon-reload
systemctl enable fsp-mock-api.service >/dev/null

install -m 644 "$HERE/nginx/fsp-security-headers.conf" /etc/nginx/snippets/fsp-security-headers.conf
rm -f /etc/nginx/sites-enabled/default
if [ ! -f /etc/letsencrypt/live/fsp-demo/fullchain.pem ]; then
  install -m 644 "$HERE/nginx/fsp-demo-acme.conf" /etc/nginx/sites-available/fsp-demo.conf
  ln -sfn /etc/nginx/sites-available/fsp-demo.conf /etc/nginx/sites-enabled/fsp-demo.conf
  nginx -t
  systemctl reload nginx
  certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --webroot --webroot-path /var/www/acme \
    --preferred-profile shortlived --ip-address "$PUBLIC_IP" \
    --cert-name fsp-demo --deploy-hook 'systemctl reload nginx'
fi
# Renew when less than three days of the 160-hour lifetime remain (about twice a week).
sed -i '/^renew_before_expiry/d' /etc/letsencrypt/renewal/fsp-demo.conf
sed -i '1i renew_before_expiry = 3 days' /etc/letsencrypt/renewal/fsp-demo.conf

sed "s/__PUBLIC_IP__/$PUBLIC_IP/g" "$HERE/nginx/fsp-demo.conf" > /etc/nginx/sites-available/fsp-demo.conf
ln -sfn /etc/nginx/sites-available/fsp-demo.conf /etc/nginx/sites-enabled/fsp-demo.conf
nginx -t
systemctl reload nginx
systemctl list-timers snap.certbot.renew.timer --no-pager
echo "Provisioned $PUBLIC_IP"
