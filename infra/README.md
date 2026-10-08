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
| `fsp-simulator.service` | Fictional participant-results HTTP service on private loopback 4020; released with the API, no public nginx route |
| `fsp-api.service` | Hardened systemd unit for the Rust API (same user and port; `StateDirectory=fsp` gives it `/var/lib/fsp`) |
| `backup-db.sh`, `fsp-backup.service`, `fsp-backup.timer` | Private daily PostgreSQL archives, with a tested restore procedure |
| `nginx/` | Site config (SPA fallback, `/api/v1/` proxy, `/__mock__` → 404), ACME bootstrap config, security headers |

nginx serves the built SPA from `/opt/fsp/current/frontend/dist` with an `index.html` fallback, forwards only
`/api/v1/` to `127.0.0.1:4010` with a loopback `Host`, marks the session cookie `Secure` and answers `/__mock__`
with 404. The mock runs with `FSP_MOCK_DEV_ROUTES=0` and the stand's origin in `FSP_MOCK_ALLOWED_ORIGINS`
(`/etc/fsp/mock-api.env`); the Rust service reads `/etc/fsp/rust-api.env` (`FSP_AUTH_MODE=demo`,
`FSP_SECURE_COOKIE=1`, origins and the GitHub callback URL) plus `/etc/fsp/db.env` (`DATABASE_URL`) and
`/etc/fsp/llm.env` (`BIFROST_*`). Build-time flags for the stand are in
`/etc/fsp/frontend-build.env` (`VITE_DEMO_STAND=1`, `VITE_DEMO_EMAIL_CODE`). The host builds with Bun and Rust
(`/opt/rustup`, `/opt/cargo`); there is no Node.

## API implementation

`/etc/fsp/api-backend` contains `mock` (initial provisioning default) or `rust` (current stand). `release.sh` reads it on every deploy: only the selected
unit is enabled and bound to :4010, so a reboot restores exactly the selected implementation. Switching is a flag
plus a service restart — no redeploy needed:

```sh
# cut the stand over to the Rust backend (built during every deploy since the toolchain exists)
ssh -F .fsp-infra/ssh/config fsp-demo 'echo rust > /etc/fsp/api-backend && systemctl disable --now fsp-mock-api; systemctl enable --now fsp-simulator fsp-api'

# back to the mock
ssh -F .fsp-infra/ssh/config fsp-demo 'echo mock > /etc/fsp/api-backend && systemctl disable --now fsp-api fsp-simulator; systemctl enable --now fsp-mock-api'
```

## Docker

[`../docker-compose.yml`](../docker-compose.yml) runs the same platform without a host setup: `api` builds
[`../backend/Dockerfile`](../backend/Dockerfile) (Rust, loopback only) and `web`
builds [`../frontend/Dockerfile`](../frontend/Dockerfile) (the demo build served by unprivileged nginx with
[`docker/nginx.conf`](docker/nginx.conf) and the stand's security headers). `web` shares the network namespace of
`api`, so nginx reaches the API on `127.0.0.1:4010` exactly as on the stand and only port 8080 is published. Both
containers run read-only as non-root users with every capability dropped. `FSP_PORT` changes the published port;
`FSP_ALLOWED_ORIGINS` lists browser origins when the demo is opened under another host name. A `db` service runs
`postgres:17-alpine` on `127.0.0.1:5434` with a `pg_isready` healthcheck that `api` waits for; the `pg-data`
volume persists the database across container restarts. An optional LLM chain reaches the host's Bifrost gateway
through `host.docker.internal` (see [`.env.example`](../.env.example)).
The private `fsp-simulator` container has no published port; API connect/sync calls it at
`FSP_SIMULATOR_URL=http://fsp-simulator:4020` and startup waits for its healthcheck.
PDF import is opt-in and off in default Compose: no privileged/seccomp bypass is enabled.

## Commands

Run from the repository root:

```sh
# one-time host setup (idempotent; re-run to pick up new packages or units)
scp -F .fsp-infra/ssh/config -r infra fsp-demo:/root/fsp-deploy
ssh -F .fsp-infra/ssh/config fsp-demo 'bash /root/fsp-deploy/provision.sh 188.166.88.183'

# build a git ref on the host and switch to it (default ref: main); the last five releases are kept
infra/deploy.sh main

# roll back to a kept release through the same lock, validation and recovery path
ssh -F .fsp-infra/ssh/config fsp-demo 'ls -1dt /opt/fsp/releases/*'
ssh -F .fsp-infra/ssh/config fsp-demo 'bash /opt/fsp/current/infra/release.sh <full-sha>'

# smoke the deployed stand from a workstation
cd frontend && FSP_PUBLIC_URL=https://188.166.88.183 FSP_DEMO_CODE=123456 bun run e2e:public
```

`deploy.sh` uploads into a unique staging directory. The host lock covers build, activation and verification;
it also serializes manual deployments with CI. Completed SHA directories are immutable. Repeating the current
SHA only checks health; it never deletes or rebuilds the running application. Use a new commit for a rebuild.
Activation installs the release's API units, nginx site and security headers. A failed nginx validation, restart,
reload or health check restores the prior files, symlink and selected API. The current and previous releases
are protected from retention even when rolling back to an older SHA. A process killed with SIGKILL or a host
power failure cannot run a shell rollback handler; inspect the current symlink and service health after recovery.

Database migrations run when Rust starts and are forward-only. A binary rollback does not undo a migration;
releases must retain compatibility with the previous schema. Take a backup before a schema change.
`deploy.sh` ships the scripts of the requested ref; use the current release script for historical rollback.

`.github/workflows/deploy.yml` ships `main` as a gated pipeline on every push to the shared repository:

1. `platform`, `backend` and `infra` reusable jobs run the CI suites and deployment fault/backup tests — a red check blocks the release.
2. `stand` deploys via `infra/deploy.sh` over SSH (secrets `FSP_DEPLOY_KEY`, `FSP_DEPLOY_KNOWN_HOSTS`; the
   fork is skipped by a repository guard) and then runs a public smoke: HTTPS frontend, `/api/v1/meta`, a demo
   login round-trip and `/__mock__` staying 404. The job targets the GitHub `stand` environment, so releases
   show up under Deployments.
3. `public-e2e` runs the Playwright public suite (`e2e:public`) against the live stand and uploads test
   results on failure.

Deploys serialize through the `stand-deploy` concurrency group and the host-side `release.sh` keeps
atomic switching plus automatic rollback on failed health checks.

## Backups and recovery

`fsp-backup.timer` runs daily with persistent scheduling. Its service runs as `postgres`, writes mode-600
custom-format archives under `/var/backups/fsp`, and retains completed archives for 14 days. It validates an
archive before publishing it atomically or pruning old files. A failed dump preserves previous backups.
The backup script is installed at `/usr/local/libexec/fsp-backup-db` by provisioning; update that installed
copy when changing the script. Run `systemctl start fsp-backup` before a migration and inspect
`journalctl -u fsp-backup` and `systemctl list-timers fsp-backup.timer`.

Local archives protect against application mistakes, not loss of the droplet. Copy them over the existing
SSH connection to private storage outside the host (for example git-ignored `.fsp-infra/backups/`); never
commit them or send them to a public artifact service. Off-host retention is not automated.

Test recovery into a newly created isolated database, not the live `fsp` database:

```sh
sudo -u postgres createdb fsp_restore_check
sudo -u postgres pg_restore --dbname=fsp_restore_check --single-transaction --exit-on-error --no-owner /var/backups/fsp/<archive>.dump
sudo -u postgres psql -d fsp_restore_check -c 'SELECT count(*) FROM _sqlx_migrations'
sudo -u postgres dropdb fsp_restore_check
```

For a live recovery, stop the API, preserve the damaged database, restore into a new database owned by `fsp`,
validate it, and change the root-managed connection setting before starting the API. This requires a deliberate
recovery decision; ordinary deployment never restores or drops the live database. CI verifies a real dump/restore
round trip and that a failed backup leaves the previous archive intact (`infra/tests/backup.sh`).

| Task on the host | Command |
| --- | --- |
| API status / logs | `systemctl status fsp-mock-api fsp-api`, `journalctl -u fsp-api -n 100` |
| Which API serves | `cat /etc/fsp/api-backend` |
| Reset demo data (mock) | `systemctl restart fsp-mock-api` (state is in memory; seeded `baseline` scenario) |
| Certificate | `certbot certificates`; renewal by `snap.certbot.renew.timer` three days before expiry, then `systemctl reload nginx` |
| Renewal dry run | `certbot renew --cert-name fsp-demo --dry-run --no-random-sleep-on-renew` |

While the mock serves, the demo API is shared by every visitor and keeps state only until restart. It is not
production authentication: codes are fixed, email codes remain publicly known, and fixture data
is synthetic. The Rust backend persists sessions and profiles in PostgreSQL; the demo code stays fixed in `demo`
mode.

## PostgreSQL

The only datastore. `provision.sh` installs the distro package, pins `listen_addresses = 'localhost'` via a
`conf.d/fsp-localhost.conf` drop-in, creates a `fsp` login role and `fsp` database owned by it, and writes the
generated URL to root-managed `/etc/fsp/db.env` (`640 root:fsp`). The file is created once — re-runs never
rotate the password. `fsp-api.service` loads it through `EnvironmentFile=-/etc/fsp/db.env` and orders itself
`After=postgresql.service`; migrations and the demo seed run inside `PostgresRepository::connect`, so a fresh
database is ready on first start.

| Task | Command |
| --- | --- |
| Shell | `su - postgres -c "psql -d fsp"` or `psql "$DATABASE_URL"` after sourcing `db.env` |
| Backup | `systemctl start fsp-backup.service`; inspect the private archive and service journal |
| Restore test | Use a new isolated database as described in [Backups and recovery](#backups-and-recovery) |
| Rotate password | `ALTER ROLE fsp PASSWORD '…'` then update `DATABASE_URL` in `/etc/fsp/db.env` and restart `fsp-api` |

Migrations are forward-only (`sqlx::migrate!` at startup). A binary rollback must remain compatible with the
current schema; restoring an earlier database is a separate recovery operation, never an automatic deploy step.
The installed `fsp-backup.timer` provides daily local backups. Off-host retention remains an operator task.

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
| `/etc/fsp/llm.env` | `NDDEV_CLIPROXY_KEY` (CLIProxyAPI api-key), `NDDEV_BIFROST_KEY` (Bifrost virtual key) and the backend-side `BIFROST_CHAT_URL`, `BIFROST_API_KEY` (= the virtual key), `BIFROST_MODEL=grok-build/grok-4.7` — `fsp-api.service` loads the same file, so provisioning never rewrites it |

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

## PDF and fictional FSP runtime

For digital PDF import, provisioning installs `bubblewrap`, `poppler-utils` and the narrow executable profile
[`apparmor/fsp-pdf-bwrap`](apparmor/fsp-pdf-bwrap), allowing user namespaces for `/usr/bin/bwrap` on Ubuntu 24.04.
Global unprivileged-userns restrictions stay enabled. The API unit permits `AF_NETLINK` for namespace setup;
the parser still runs without host network/secrets, under process/time/output/concurrency limits.
Set `FSP_PDF_IMPORT=1` in the private API environment and configure Bifrost. Startup probes the actual sandbox
and fails closed if unavailable. There is no unsandboxed fallback. See [backend limits](../backend/README.md#pdf-import-runtime).

The release builds both Rust binaries, installs/restarts `fsp-simulator.service` before API activation and checks
its loopback health together with API and nginx. Failed activation restores the previous units/release. Rolling
back to an older release without the simulator stops the helper; it does not undo additive database migrations.
`0004_fsp_results.sql` preserves historical records with an empty detailed-results array until refreshed.
[FSP fixtures](../docs/fsp-simulator.md) are entirely fictional and cannot establish real federation identity.
