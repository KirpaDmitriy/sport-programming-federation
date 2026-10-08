# Demo stand

One DigitalOcean droplet (`fsp-career-demo`, Ubuntu 24.04, 8 vCPU / 16 GiB) serves the platform at
<https://nddev.link> through Cloudflare Full (strict), with a Let's Encrypt origin certificate.
The original IP `188.166.88.183` retains its short-lived certificate for a canonical HTTPS redirect. Access material (SSH
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
(`/etc/fsp/mock-api.env`); the Rust service reads `/etc/fsp/rust-api.env` (`FSP_AUTH_MODE=resend`,
`FSP_SECURE_COOKIE=1`, origins and the GitHub callback URL) plus `/etc/fsp/db.env` (`DATABASE_URL`) and
`/etc/fsp/llm.env` (`BIFROST_*`). Build-time flags for the stand are in
`/etc/fsp/frontend-build.env` (`VITE_DEMO_STAND=1`; omit the obsolete demo code in real-mail builds). The host builds with Bun and Rust
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
containers run read-only as non-root users with every capability dropped. The application binds to loopback
by default; `FSP_BIND_IP` explicitly changes the interface, `FSP_PORT` changes the port and `FSP_DB_PORT` the local DB port;
`FSP_AUTH_MODE=resend` requires `FSP_AUTH_KEY`, `RESEND_API_KEY` and `FSP_EMAIL_FROM`.
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
cd frontend && FSP_PUBLIC_URL=https://nddev.link FSP_AUTH_MODE=resend bun run e2e:public
# FSP_RESEND_ACCEPTANCE_KEY must be injected privately; never put it in shell history.
```

`deploy.sh` uploads into a unique staging directory. The host lock covers build, activation and verification;
it also serializes manual deployments with CI. Completed SHA directories are immutable. Repeating the current
SHA only checks health; it never deletes or rebuilds the running application. Use a new commit for a rebuild.
Activation installs the release's API units, nginx site and security headers. A failed nginx validation, restart,
reload or health check restores the prior files, symlink and selected API. The current and previous releases
are protected from retention even when rolling back to an older SHA. A process killed with SIGKILL or a host
power failure cannot run a shell rollback handler; inspect the current symlink and service health after recovery.

Database migrations run when Rust starts and are forward-only. A binary rollback does not undo a migration;
all new migrations must preserve reads/writes by every retained rollback binary. Take a backup before a schema change.
`backend/ROLLBACK_COMPATIBLE` declares the `sqlx-forward-additive-v1` startup policy: only unknown versions
newer than the embedded history are tolerated; known checksums and dirty state are still checked under SQLx's
advisory lock. It is not proof that arbitrary DDL is backward compatible; review additive SQL and application
semantics. Renames, drops and new mandatory columns require a separate compatibility/retention plan.

The pre-activation guard rejects edited or divergent migration histories, adding migrations while the previous
binary still has SQLx's strict legacy policy, and rollback to strict binaries after forward-compatible code has
run. Ship migration compatibility separately before introducing the next schema change. Once this release is
active, historical releases without the policy marker are deliberately unavailable for manual rollback.
Never edit/delete applied migration records to force an old binary to start. The October 8 release incident
exposed this failure: migration 0004 applied, the PDF probe failed and the older binary rejected migration 4.
Recovery served the newer binary with PDF disabled; no schema or data was reverted.
`deploy.sh` rejects every historical archive without the migration-policy marker before running its script,
then validates against the active controller as well. Use current deployment tooling for rollback; directly
running an archived pre-guard script is unsupported and bypasses these protections.

The [external CI controller](ci/README.md) on the existing private CI fleet replaces GitHub Actions.
It reports `fsp/platform`, `fsp/backend`, `fsp/compose` and `fsp/release-safety` for exact commits, retains
private logs, and checks actual merged trees before automatically moving personal → dev → main.

Verified current main is deployed with `infra/deploy.sh` over a pinned SSH connection. The controller then
checks public HTTPS/meta/session/mock isolation and runs the actual Playwright journey with real delivered
Resend codes. `fsp/deployment` passes only after browser acceptance. A single systemd service plus OS lock
serializes controller runs, and `release.sh` independently locks the stand and recovers failed activations.
Credentials are root-only on the CI host; neither PR jobs nor git contain deployment or email credentials.

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
| Renewal dry run | `certbot renew --cert-name nddev.link --dry-run --no-random-sleep-on-renew` |

While the mock serves, the demo API is shared by every visitor and keeps state only until restart. It is not
production authentication: codes are fixed, email codes remain publicly known, and fixture data
is synthetic. The Rust backend persists sessions and profiles in PostgreSQL; the demo code stays fixed in `demo`
mode.

## PostgreSQL

The only datastore. `provision.sh` installs the distro package, pins `listen_addresses = 'localhost'` via a
`conf.d/fsp-localhost.conf` drop-in, creates a `fsp` login role and `fsp` database owned by it, and writes the
generated URL to root-managed `/etc/fsp/db.env` (`640 root:fsp`). The file is created once — re-runs never
rotate the password. `fsp-api.service` loads it through `EnvironmentFile=-/etc/fsp/db.env` and orders itself
`After=postgresql.service`; adapter configuration, PDF extraction and socket binding are checked before
`PostgresRepository::connect` applies migrations. `PlatformService::initialize` then seeds the demo records,
so a fresh database is ready on first start.

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
5. `meta.capabilities.realEmail` hides demo account hints when real mail is active.
   `VITE_DEMO_STAND` may retain honest synthetic-data labels; a build-time code never bypasses server verification.

## PDF and fictional FSP runtime

For digital PDF import, provisioning installs `bubblewrap`, `poppler-utils` and the narrow executable profile
[`apparmor/fsp-pdf-bwrap`](apparmor/fsp-pdf-bwrap), allowing user namespaces for `/usr/bin/bwrap` on Ubuntu 24.04.
Global unprivileged-userns restrictions stay enabled. The API unit permits `AF_NETLINK` for namespace setup;
the parser still runs without host network/secrets, under process/time/output/concurrency limits.
Set `FSP_PDF_IMPORT=1` in the private API environment and configure Bifrost. Startup probes the actual sandbox
using a real embedded one-page PDF before touching PostgreSQL and fails closed if unavailable.
Poppler runs without a `/proc` mount: it is unnecessary and conflicts with `ProtectKernelTunables` on the stand.
`sudo bash infra/tests/pdf-runtime.sh /absolute/path/to/fsp-career-api` checks real extraction with the restrictions
read directly from `fsp-api.service`, without application environment, database or LLM access. CI runs it on
Ubuntu/systemd, and release activation runs it before changing units or the active symlink when PDF is enabled.
For first enablement, probe the deployed binary, set the flag, restart the API and check capability plus a real
preview. If this fails, restore the flag before restarting. There is no unsandboxed fallback. See [backend limits](../backend/README.md#pdf-import-runtime).

The release builds both Rust binaries, installs/restarts `fsp-simulator.service` before API activation and checks
its loopback health together with API and nginx. Failed activation restores the previous units/release. Rolling
back to a schema-compatible release without the simulator stops the helper. The schema guard runs first;
helper lifecycle support alone does not make a historical binary a valid rollback target.
`0004_fsp_results.sql` preserves historical records with an empty detailed-results array until refreshed.
[FSP fixtures](../docs/fsp-simulator.md) are entirely fictional and cannot establish real federation identity.

## Domain and Resend

`FSP_PUBLIC_WEB_URL=https://nddev.link`, matching `FSP_ALLOWED_ORIGINS`, and
`FSP_TLS_CERT_NAME=nddev.link` configure the public hostname. `render-nginx.sh`
validates those values without sourcing secrets. Provisioning preserves the
existing runtime hostname. Certificate renewal uses `/var/www/acme` over both
HTTP and HTTPS; verify `certbot renew --cert-name nddev.link --dry-run` after
DNS/proxy changes. Cloudflare uses Full (strict), minimum TLS 1.2, and respects
origin cache headers. `/api/v1/` always returns `Cache-Control: no-store`.
Visitor IP headers are trusted only from the published Cloudflare networks in
`nginx/fsp-cloudflare-real-ip.conf`; review this list during infrastructure upkeep.

The sending domain is `auth.nddev.link`, region `eu-west-1`, sender
`login@auth.nddev.link`. DKIM, SPF/return-path, alternative transport CNAME and
receiving MX records must match Resend's domain API. DMARC is `p=reject` with
relaxed alignment; tracking is disabled and mail transport requires TLS.
Resend receiving supplies unique `fsp-ci-*` acceptance inboxes on the same
owned subdomain. Do not configure forwarding or send replies from these inboxes.

Keep `RESEND_API_KEY` (domain-restricted `sending_access`), `FSP_EMAIL_FROM`,
`FSP_AUTH_KEY` and `FSP_AUTH_MODE=resend` in `/etc/fsp/rust-api.env`, mode 640,
root:fsp. The application never needs domain-management or mailbox-read access.
Codes and authentication keys must not appear in logs, artifacts or commits.
The CLI uses a separate local `fsp` profile; this headless host stores it in a
mode-600 credentials file because a desktop secret service is unavailable.

Release variables `FSP_PUBLIC_URL` and `FSP_AUTH_MODE` must match the stand.
The `stand` GitHub environment holds `FSP_RESEND_ACCEPTANCE_KEY`, a separate
Resend key used only by the trusted main-branch browser job to read unique test
inboxes. Resend currently requires `full_access` for received-email retrieval;
this key is deliberately excluded from the runtime and pull-request jobs. Rotate
it independently. The acceptance test requires genuine inbound mail with passing
DKIM/DMARC, then creates a candidate and two companies through public workflows.
No fixed code or auth bypass is enabled. Browser traces/screenshots are disabled
for this suite so OTPs and session cookies cannot enter CI artifacts.

For the first cutover, deploy the supporting release while the IP/demo settings
still work, back up runtime/nginx configuration, and only then atomically switch
hostname, certificate, origins and real-mail secrets. Reload nginx and restart
the API; verify origin TLS, email delivery and login before enabling the Cloudflare
proxy and updating release variables. Restore the private configuration backup
if activation fails. Subsequent releases use the normal guarded deployment.
`RUNTIME_CAPABILITIES` and `check-runtime-compatibility.sh` reject rollbacks that
cannot support the active domain or real-mail authentication. Never disable real
mail or restore old demo authentication as a normal rollback procedure.

Rotating `FSP_AUTH_KEY` invalidates all existing sessions/codes while preserving
accounts and profiles. Back up this secret separately from the database.
Resend's delivered event means recipient-server acceptance; only mailbox evidence
or the recipient can confirm inbox placement. Inspect bounced/failed messages by
delivery ID in the Resend dashboard or CLI without printing OTP bodies.
