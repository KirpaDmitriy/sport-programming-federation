# Operations and delivery

Public site https://nddev.link; existing origin 188.166.88.183. Domain/email cutover completed on October 8; #38 tracks proof;
external CI migration in #40. Both deliveries are complete; #50 checked consistency; #54 disables backups and redundant copies. See docs/current-state.md for current limits.
Private stand/Resend state is in the original checkout's ignored .fsp-infra/; never print credentials.
User explicitly authorized existing CI servers after canonical Actions billing failed and runner registration
was denied. Both former runner hosts are now gone: runner-2 was retired earlier, and an external DigitalOcean
action deleted runner-1 on 2026-10-11 at 08:16 UTC. Operator-assisted CI recovery now uses the existing private Amsterdam workspace host. Ubuntu SSH troubleshooting
was stopped at the owner's request; unattended authentication remains unresolved in #161. Other projects/hosts are not automatically authorized. Do not connect to the retired IPs.

Canonical upstream KirpaDmitriy/sport-programming-federation; the additional GitHub mirror is retired. Feature -> danil/dima
-> dev -> main uses PRs. infra/ci controller reports four fsp/* statuses, preserves independent security checks,
checks unchanged heads/bases and merged tree identity, and deploys verified current main. Actions is retired.
Controller installation is reviewed separately; no PR auto-updates it. Root-only /etc/fsp-ci stores credentials;
builds run as fsp-ci with no injected secrets. Docker is root-equivalent; trusted private maintainers only.
CI timer/OS lock serialize jobs, retain logs 14 days, refuse builds below 15 GiB free. A matching accepted
receipt repairs a failed final GitHub status write without redeployment; status receipts prevent duplicate writes.

Stand units: fsp-api:4010, fsp-simulator:4020, fsp-github-insights:4030 (tokenless; needs git, clones in its
CacheDirectory; API needs FSP_GITHUB_INSIGHTS_URL), fsp-interview:4040, fsp-bifrost, fsp-cliproxy, nginx, postgresql@16-main.
/health is unversioned. Full-SHA immutable releases, host lock, nginx checks and rollback preserve current data.
Same-SHA replay health-checks without rebuilding. Current/previous releases are retained. Schema guards reject
changed histories/legacy strict SQLx archives; only additive forward-compatible migrations are supported.
Runtime guards reject rollback lacking domain/resend support after cutover. Never edit applied migrations.
PDF requires Bifrost, Poppler/bwrap and executable-specific AppArmor; exact systemd restrictions are probed.
No /proc mount or global namespace relaxation. Failed activation restores configs/units; SIGKILL cannot run traps.

Cloudflare Full (strict), origin Let's Encrypt cert, canonical IP redirect, trusted CF IP ranges, API no-store.
Host-only HSTS is one week on HTTPS (including errors), absent on plain HTTP; nosniff/cache headers are unique.
Asset-cache policy (#159/#160) makes assets immutable only on 200/206/304 and errors no-store.
Probe a fresh URL and purge the confirmed cached /assets/missing-header-probe.js response after deployment.
The renewal unit is snap.certbot.renew.timer. Historical smoke API on 4011 was terminated after identity checks (#154).
Resend auth.nddev.link sends as login@auth.nddev.link with DKIM/SPF/DMARC, tracking off and enforced TLS.
Runtime key is sending-only/domain-restricted; private acceptance key reads real CI inboxes. HMAC key changes
invalidate old sessions/codes without deleting accounts. SMTP delivery and actual inbox placement are distinct.

Owner standard: no backups, snapshots, off-host backup copies or redundant repository mirroring unless explicitly
requested later. FSP backup units are masked; provisioning/CI must not recreate archives. Existing project backup
archives were deleted. Sync local branches with canonical upstream only. OpenObserve 1.0.4 and Vector 0.59.0 are active on the stand; see infra/observability/README.md.
GitHub OAuth remains deferred. No production DB reset, unrelated-host changes or unrequested credential rotation.

Compare upstream/main, /opt/fsp/current and /var/lib/fsp-ci/deployed.json on Amsterdam. Historical 405fecc
receipts are not current proof. The one-off recovery bridge calls the installed controller through the owner's
existing GitHub CLI session; no GitHub token is copied into jobs. The timer is disabled. Four real gate statuses
and public/mail acceptance are still mandatory. Source integration is PR #172; feature issues remain open until
actual live verification. The operator bridge is private operational tooling, not an unattended CI restoration.
Credential follow-up #139 installed a separate classic PAT for rldyourmnd with exactly repo scope on October 11;
expires November 10, 2026 at 06:31:54 UTC. Its active secret copy was on the deleted host. Recovery must establish
whether an authorized migration preserved it; otherwise replace it and revoke the orphan dedicated token.
The original broad credential stays unchanged in the owner's CLI; never reduce/revoke it for this project.
The reviewed `infra/ci/install_token.py` reads stdin, validates exact repo scope, expiration, identity and access,
then replaces root-only credentials under the controller lock. Run from accepted main; see infra/ci/README.md.
The one-time local PAT handoff was removed. Stand SSH and dedicated acceptance-mail files remain privately
available in .fsp-infra. Issue #139 holds historical verification receipts; #161 controls current recovery.
A classic repo-scoped PAT is not restricted to a single repository.
Follow-ups #152/#154/#155 cover status recovery, edge/process cleanup and explicit HTTPError response closure.
Last commits: e078301 (status recovery), b3f80bf (credential response cleanup), 63bb5eb (headers); 20 CI tests.
Read issue receipts and compare live refs for current accepted release and installed controller/helper hashes.

Last asset-cache change: f6d2f70; real nginx probes include 200, 206, 304 and missing-file responses.

Shutdown implementation (#162/#163) drains HTTP on SIGINT/SIGTERM in all four Rust roots, registers signals
synchronously and propagates registration errors. API/interview supervisor grace is 60 seconds. A controlled
model and real PostgreSQL regression prove in-flight answers finish and persist before exit; process-local
background jobs are still not durable. Check live source identity and issue receipts instead of historical counts.

Recovery found two host assumptions in CI: duplicate packaged/FSP AppArmor attachments and fixed Compose ports.
infra/install-pdf-sandbox.sh reuses the packaged bwrap profile when present and probes as an unprivileged user.
Compose CI allocates loopback ports dynamically and checks its explicitly configured logical origin. Neither
fix relaxes global namespace policy or stops another workload. Full gates are repeated after these repairs.

Observability: private UI on 127.0.0.1:5080, ingest-only Vector credential, fixed same-origin browser intake,
14-day retention, bounded CPU/memory/queues and vendor telemetry disabled. Nine-panel dashboard queries and
stored RUM/replay privacy canaries were checked on the actual stand. No external alert delivery or OTLP exporter.
Application activation is through verified main; support-service installation does not prove browser rollout.
