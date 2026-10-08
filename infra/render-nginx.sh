#!/usr/bin/env bash
# Render only validated host/certificate identifiers; environment files are not executed.
set -euo pipefail
config="${1:?usage: render-nginx.sh <rust-api.env>}"
here="$(cd "$(dirname "$0")" && pwd)"
host="$(sed -n 's|^FSP_PUBLIC_WEB_URL=https://||p' "$config")"
cert="$(sed -n 's/^FSP_TLS_CERT_NAME=//p' "$config")"
cert="${cert:-fsp-demo}"
[[ ${#host} -le 253 && "$host" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$host" != *..* ]] \
  || { echo 'Invalid HTTPS public hostname' >&2; exit 1; }
[[ "$cert" =~ ^[a-z0-9][a-z0-9.-]*$ && "$cert" != *..* ]] \
  || { echo 'Invalid certificate name' >&2; exit 1; }
default_server=default_server
[[ "$cert" == fsp-demo ]] || default_server=''
cat "$here/nginx/fsp-cloudflare-real-ip.conf"
sed -e "s/__PUBLIC_HOST__/$host/g" -e "s/__CERT_NAME__/$cert/g" \
  -e "s/__DEFAULT_SERVER__/$default_server/g" "$here/nginx/fsp-demo.conf"
if [[ "$cert" != fsp-demo ]]; then
  cat <<CONFIG

# Preserve a valid HTTPS redirect from the original IP address.
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;
    server_tokens off;
    ssl_certificate /etc/letsencrypt/live/fsp-demo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fsp-demo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://$host\$request_uri;
}
CONFIG
fi
