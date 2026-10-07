# Demo stand

One DigitalOcean droplet (`fsp-career-demo`, Ubuntu 24.04, 8 vCPU / 16 GiB) serves the platform at
<https://188.166.88.183> with a Let's Encrypt IP certificate (shortlived profile, 160 hours). Access material (SSH
key, host key, droplet metadata) lives in the git-ignored `.fsp-infra/` at the repository root.

| File | Role |
| --- | --- |
| `provision.sh` | One-time, idempotent host setup: packages, pinned Bun with checksum, rustup toolchain for the backend build, certbot, ufw, nginx, units, certificate |
| `deploy.sh` | Archives a git ref (`frontend`, `mock-server`, `backend`, `infra`), copies it to the host and runs `release.sh` there |
| `release.sh` | On the host: builds the release (frontend, mock, Rust backend), switches `/opt/fsp/current` atomically, runs the API implementation chosen by `/etc/fsp/api-backend`, health-checks and rolls back on failure |
| `fsp-mock-api.service` | Hardened systemd unit for the mock API (user `fsp`, `127.0.0.1:4010`) |
| `fsp-api.service` | Hardened systemd unit for the Rust API (same user and port; `StateDirectory=fsp` gives it `/var/lib/fsp`) |
| `kontur-talent-rust.service` | The unit Dima uses on his own test stand (93.77.179.211); kept for reference, not installed here |
| `nginx/` | Site config (SPA fallback, `/api/v1/` proxy, `/__mock__` → 404), ACME bootstrap config, security headers |

nginx serves the built SPA from `/opt/fsp/current/frontend/dist` with an `index.html` fallback, forwards only
`/api/v1/` to `127.0.0.1:4010` with a loopback `Host`, marks the session cookie `Secure` and answers `/__mock__`
with 404. The mock runs with `FSP_MOCK_DEV_ROUTES=0` and the stand's origin in `FSP_MOCK_ALLOWED_ORIGINS`
(`/etc/fsp/mock-api.env`); the Rust service reads `/etc/fsp/rust-api.env` (`FSP_DATABASE`, `FSP_AUTH_MODE=demo`,
`FSP_SECURE_COOKIE=1`, origins and the GitHub callback URL). Build-time flags for the stand are in
`/etc/fsp/frontend-build.env` (`VITE_DEMO_STAND=1`, `VITE_DEMO_EMAIL_CODE`). The host builds with Bun and Rust
(`/opt/rustup`, `/opt/cargo`); there is no Node.

## API implementation

`/etc/fsp/api-backend` contains `mock` (default) or `rust`. `release.sh` reads it on every deploy: only the selected
unit is enabled and bound to :4010, so a reboot restores exactly the selected implementation. Switching is a flag
plus a service restart — no redeploy needed:

```sh
# cut the stand over to the Rust backend (built during every deploy since the toolchain exists)
ssh -F .fsp-infra/ssh/config fsp-demo 'echo rust > /etc/fsp/api-backend && systemctl disable --now fsp-mock-api; systemctl enable --now fsp-api'

# back to the mock
ssh -F .fsp-infra/ssh/config fsp-demo 'echo mock > /etc/fsp/api-backend && systemctl disable --now fsp-api; systemctl enable --now fsp-mock-api'
```

## Docker

[`../docker-compose.yml`](../docker-compose.yml) runs the same platform without a host setup: `api` builds
[`../backend/Dockerfile`](../backend/Dockerfile) (Rust, loopback only) and `web`
builds [`../frontend/Dockerfile`](../frontend/Dockerfile) (the demo build served by unprivileged nginx with
[`docker/nginx.conf`](docker/nginx.conf) and the stand's security headers). `web` shares the network namespace of
`api`, so nginx reaches the API on `127.0.0.1:4010` exactly as on the stand and only port 8080 is published. Both
containers run read-only as non-root users with every capability dropped. `FSP_PORT` changes the published port;
`FSP_ALLOWED_ORIGINS` lists browser origins when the demo is opened under another host name. The `fsp-data` volume
persists the SQLite database across container restarts. An optional LLM chain reaches the host's Bifrost gateway
through `host.docker.internal` (see [`.env.example`](../.env.example)).

## Commands

Run from the repository root:

```sh
# one-time host setup (idempotent; re-run to pick up new packages or units)
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
with it; roll back to a kept release instead. Failed health checks roll the release back automatically.

`.github/workflows/deploy.yml` deploys `main` on every push to the shared repository with a dedicated deploy key
(secrets `FSP_DEPLOY_KEY`, `FSP_DEPLOY_KNOWN_HOSTS`; the fork is skipped by a repository guard).

| Task on the host | Command |
| --- | --- |
| API status / logs | `systemctl status fsp-mock-api fsp-api`, `journalctl -u fsp-api -n 100` |
| Which API serves | `cat /etc/fsp/api-backend` |
| Reset demo data (mock) | `systemctl restart fsp-mock-api` (state is in memory; seeded `baseline` scenario) |
| Reset demo data (rust) | `systemctl stop fsp-api && rm /var/lib/fsp/fsp.sqlite3* && systemctl start fsp-api` (reseeds on boot) |
| Certificate | `certbot certificates`; renewal by `snap.certbot.renew.timer` three days before expiry, then `systemctl reload nginx` |
| Renewal dry run | `certbot renew --cert-name fsp-demo --dry-run --no-random-sleep-on-renew` |

While the mock serves, the demo API is shared by every visitor and keeps state only until restart. It is not
production authentication: codes are fixed, there is no rate limiting beyond the mock's attempt counter, and data
is synthetic. The Rust backend persists sessions and profiles in SQLite; the demo code stays fixed in `demo` mode.

## Backend cutover checklist

1. The backend passes the [cutover checklist](../contracts/API_INTEGRATION.md#backend-cutover-checklist) —
   including the error envelope, idempotency and pagination semantics — and its tests cover the mock's cases.
2. `meta.capabilities` reports the features the backend actually serves; the frontend must not hide a flow the
   demo needs.
3. Flip `/etc/fsp/api-backend` to `rust` (above), run `infra/deploy.sh main`, then `e2e:public` against the stand.
4. Keep `location ^~ /__mock__ { return 404; }` — the production backend never implements development controls.
5. Build the frontend without `VITE_DEMO_STAND` and `VITE_DEMO_EMAIL_CODE` once e-mail delivery is real.
