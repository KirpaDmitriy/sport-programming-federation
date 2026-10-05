# Demo stand

One DigitalOcean droplet (`fsp-career-demo`, Ubuntu 24.04, 8 vCPU / 16 GiB) serves the platform at
<https://188.166.88.183> with a Let's Encrypt IP certificate (shortlived profile, 160 hours). Access material (SSH
key, host key, droplet metadata) lives in the git-ignored `.fsp-infra/` at the repository root.

| File | Role |
| --- | --- |
| `provision.sh` | One-time, idempotent host setup: packages, pinned Bun with checksum, certbot, ufw, nginx, unit, certificate |
| `deploy.sh` | Archives a git ref (`frontend`, `mock-server`, `infra`), copies it to the host and runs `release.sh` there |
| `release.sh` | On the host: installs and builds the release, switches `/opt/fsp/current` atomically, installs the unit, restarts |
| `fsp-mock-api.service` | Hardened systemd unit for the API process (today the mock) as user `fsp` on `127.0.0.1:4010` |
| `nginx/` | Site config (SPA fallback, `/api/v1/` proxy, `/__mock__` → 404), ACME bootstrap config, security headers |

nginx serves the built SPA from `/opt/fsp/current/frontend/dist` with an `index.html` fallback, forwards only
`/api/v1/` to `127.0.0.1:4010` with a loopback `Host`, marks the session cookie `Secure` and answers `/__mock__`
with 404. The mock runs with `FSP_MOCK_DEV_ROUTES=0` and the stand's origin in `FSP_MOCK_ALLOWED_ORIGINS`
(`/etc/fsp/mock-api.env`). Build-time flags for the stand are in `/etc/fsp/frontend-build.env`
(`VITE_DEMO_STAND=1`, `VITE_DEMO_EMAIL_CODE`). The host has Bun only, no Node.

## Commands

Run from the repository root:

```sh
# one-time host setup
scp -F .fsp-infra/ssh/config -r infra fsp-demo:/root/fsp-deploy
ssh -F .fsp-infra/ssh/config fsp-demo 'bash /root/fsp-deploy/provision.sh 188.166.88.183'

# build a git ref on the host and switch to it (default ref: main); the last five releases are kept
infra/deploy.sh main

# roll back to a kept release
ssh -F .fsp-infra/ssh/config fsp-demo 'ls -1dt /opt/fsp/releases/*'
ssh -F .fsp-infra/ssh/config fsp-demo 'ln -sfn /opt/fsp/releases/<sha> /opt/fsp/current && systemctl restart fsp-mock-api'

# smoke the deployed stand from a workstation
cd frontend && FSP_PUBLIC_URL=https://188.166.88.183 FSP_DEMO_CODE=123456 bun run e2e:public
```

`deploy.sh` ships the scripts of the ref it deploys, so a ref from before the `infra/` layout cannot be deployed
with it; roll back to a kept release instead.

| Task on the host | Command |
| --- | --- |
| API status / logs | `systemctl status fsp-mock-api`, `journalctl -u fsp-mock-api -n 100` |
| Reset demo data | `systemctl restart fsp-mock-api` (state is in memory; seeded `baseline` scenario) |
| Certificate | `certbot certificates`; renewal by `snap.certbot.renew.timer` three days before expiry, then `systemctl reload nginx` |
| Renewal dry run | `certbot renew --cert-name fsp-demo --dry-run --no-random-sleep-on-renew` |

The demo API is shared by every visitor and keeps state only until restart. It is not production authentication:
codes are fixed, there is no rate limiting beyond the mock's attempt counter, and data is synthetic.

## Switching the stand to the backend

The frontend only needs same-origin `/api/v1`. When the Rust service exists:

1. Give it a unit next to `fsp-mock-api.service` (or replace that unit) and its own environment file under
   `/etc/fsp/`; keep secrets out of the repository.
2. Point `location ^~ /api/v1/` in `nginx/fsp-demo.conf` at the service. The loopback `Host` header and the
   `proxy_cookie_flags fsp_mock_session secure` line exist for the mock; replace them with what the service
   needs (for example `Host $host` and `X-Forwarded-*`) and let it set `Secure` on its own cookie.
3. Keep `location ^~ /__mock__ { return 404; }`.
4. Build the frontend without `VITE_DEMO_STAND` and `VITE_DEMO_EMAIL_CODE` once e-mail delivery is real, and run the
   cutover checks listed in [`../backend/README.md`](../backend/README.md).
