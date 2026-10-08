# Operations and delivery

Public site https://nddev.link; existing origin 188.166.88.183. Domain/email cutover completed on October 8; #38 tracks proof;
external CI migration in #40. Both deliveries are complete; #50 rechecks consistency. See docs/current-state.md for current limits.
Private stand/Resend state is in the original checkout's ignored .fsp-infra/; never print credentials.
User explicitly authorized existing CI servers after canonical Actions billing failed and runner registration
was denied. Project CI lives on server-gha-runner-2; other projects/runner slots are not part of this task.

Canonical upstream KirpaDmitriy/sport-programming-federation; origin is rldyourmnd's mirror. Feature -> danil/dima
-> dev -> main uses PRs. infra/ci controller reports four fsp/* statuses, preserves independent security checks,
checks unchanged heads/bases and merged tree identity, and deploys verified current main. Actions is retired.
Controller installation is reviewed separately; no PR auto-updates it. Root-only /etc/fsp-ci stores credentials;
builds run as fsp-ci with no injected secrets. Docker is root-equivalent; trusted private maintainers only.
CI timer/OS lock serialize jobs, retain logs 14 days, refuse builds below 15 GiB free. See infra/ci/README.md.

Stand units: fsp-api:4010, fsp-simulator:4020, fsp-bifrost, fsp-cliproxy, nginx, postgresql@16-main.
/health is unversioned. Full-SHA immutable releases, host lock, nginx checks and rollback preserve current data.
Same-SHA replay health-checks without rebuilding. Current/previous releases are retained. Schema guards reject
changed histories/legacy strict SQLx archives; only additive forward-compatible migrations are supported.
Runtime guards reject rollback lacking domain/resend support after cutover. Never edit applied migrations.
PDF requires Bifrost, Poppler/bwrap and executable-specific AppArmor; exact systemd restrictions are probed.
No /proc mount or global namespace relaxation. Failed activation restores configs/units; SIGKILL cannot run traps.

Cloudflare Full (strict), origin Let's Encrypt cert, canonical IP redirect, trusted CF IP ranges, API no-store.
Resend auth.nddev.link sends as login@auth.nddev.link with DKIM/SPF/DMARC, tracking off and enforced TLS.
Runtime key is sending-only/domain-restricted; private acceptance key reads real CI inboxes. HMAC key changes
invalidate old sessions/codes without deleting accounts. SMTP delivery and actual inbox placement are distinct.

Daily private PostgreSQL backups retain 14 days and have real isolated restore tests. Copy/checksum off-host
before/after release; off-host scheduling is not automated. No OpenObserve exists: inspect systemd/nginx logs.
GitHub OAuth remains deferred. No production DB reset, unrelated-host changes or unrequested credential rotation.

Last commit: cd449516828977dd2627dabb094a2ff43600c501 (accepted baseline); consistency review and latest receipt: #50.
