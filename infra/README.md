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

`.github/workflows/deploy.yml` ships `main` as a gated pipeline on every push to the shared repository:

1. `platform` and `backend` reusable jobs run the full CI suites — a red check blocks the release.
2. `stand` deploys via `infra/deploy.sh` over SSH (secrets `FSP_DEPLOY_KEY`, `FSP_DEPLOY_KNOWN_HOSTS`; the
   fork is skipped by a repository guard) and then runs a public smoke: HTTPS frontend, `/api/v1/meta`, a demo
   login round-trip and `/__mock__` staying 404. The job targets the GitHub `stand` environment, so releases
   show up under Deployments.
3. `public-e2e` runs the Playwright public suite (`e2e:public`) against the live stand and uploads test
   results on failure.

Deploys serialize through the `stand-deploy` concurrency group and the host-side `release.sh` keeps
atomic switching plus automatic rollback on failed health checks.

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

## LLM chain

The Rust backend can call a real model for competence-graph extraction. The chain on the stand is
`fsp-api` → Bifrost (`127.0.0.1:4000`) → CLIProxyAPI (`127.0.0.1:18317`) → xAI OAuth → Grok.

Services `fsp-cliproxy.service` and `fsp-bifrost.service` run as `fsp`, bound to loopback. Binaries live in
`/opt/fsp/llm/bin/` (`cli-proxy-api`, and `bifrost` extracted from the `maximhq/bifrost:v2.2.1` image — the
stand has no Docker). Both are installed and enabled by `provision.sh` once `/etc/fsp/llm.env` exists.

Host-side secrets (never committed):

| Path | Contents |
| --- | --- |
| `/etc/fsp/cliproxy.yaml` | CLIProxyAPI config; template: [`llm/cliproxy.yaml.example`](llm/cliproxy.yaml.example) |
| `/var/lib/fsp/cliproxy-auth/xai-*.json` | xAI OAuth token file (writable — CLIProxyAPI refreshes it) |
| `/var/lib/fsp/bifrost/config.json` | Bifrost config; reference: [`llm/bifrost-config.json`](llm/bifrost-config.json) |
| `/etc/fsp/llm.env` | `NDDEV_CLIPROXY_KEY` (CLIProxyAPI api-key) and `NDDEV_BIFROST_KEY` (Bifrost virtual key) |
| `/etc/fsp/rust-api.env` | `BIFROST_CHAT_URL`, `BIFROST_API_KEY` (= the virtual key), `BIFROST_MODEL=grok-build/grok-4.7` |

Without `BIFROST_*` the backend reports `meta.capabilities.realLlm: false` and serves the deterministic
fallback graph. The xAI OAuth token is shared with the local `nddev-runtime` setup; refresh-token rotation
on one side can invalidate the other, in which case re-copy the auth file.

## Backend cutover checklist

1. The backend passes the [cutover checklist](../contracts/API_INTEGRATION.md#backend-cutover-checklist) —
   including the error envelope, idempotency and pagination semantics — and its tests cover the mock's cases.
2. `meta.capabilities` reports the features the backend actually serves; the frontend must not hide a flow the
   demo needs.
3. Flip `/etc/fsp/api-backend` to `rust` (above), run `infra/deploy.sh main`, then `e2e:public` against the stand.
4. Keep `location ^~ /__mock__ { return 404; }` — the production backend never implements development controls.
5. Build the frontend without `VITE_DEMO_STAND` and `VITE_DEMO_EMAIL_CODE` once e-mail delivery is real.
