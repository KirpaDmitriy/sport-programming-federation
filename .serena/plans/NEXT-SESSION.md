# Project handoff

Read AGENTS.md and current domain memories. Code/live evidence override older transcripts. Backend changes were
explicitly approved by Dima. User authorized real domain/email and existing private CI servers; do not ask again.
English engineering text, Russian UI; strict pinned toolchains; never expose secrets or reset production data.

Active work: #38 domain/Resend, #40 replacement for billing-blocked GitHub Actions, draft PR #39 -> danil.
Worktree /tmp/fsp-domain-email, feat/38-domain-email. Original checkout main is the previous verified 9a7681b.
New commits implement random/HMAC OTPs, delivery limits, real Resend, Cloudflare/nginx support, actual inbox browser
acceptance and private-server CI. Local Rust 67 tests and all TS gates passed; real-mail local browser passed.
Local mock browser had disk-exhaustion failures; all five accessibility tests passed on rerun (34 other tests passed).

CI installed on server-gha-runner-2 at /opt/fsp-ci with private /etc/fsp-ci, fsp-ci.timer active. Initial full server
run started October 8 12:35 UTC. Deployment remains disabled until /etc/fsp-ci/deploy-enabled exists. Read logs and
statuses; don't assume success. Canonical collaborator lacks admin rights to register Actions runners; user explicitly
chose external CI in that case. Four fsp/* gates replace retired Actions; no historical result is fabricated.

At this handoff update, stand still serves 9a7681b with IP/demo auth. Domain certificate exists and all Resend DNS
records are verified. Apex A remains DNS-only until origin domain config is active. User confirmed first real mail
at danil@nddev.ai arrived in inbox. Production runtime config is prepared privately, not applied. Cloudflare SSL
strict/minTLS1.2 already set. Final release must enable domain/Resend, proxy and HTTPS redirect, then prove public
actual-mail browser flow, code/session protections, renewal, logs and independent read-only verification.

Finish all real CI gates, fix actual failures, merge through checked PR chain, deploy main, cut over safely, update
ledgers/docs/memories to final actual state, sync original/canonical/mirror/permanent refs and stand SHA, verify
an off-host backup, clean owned local services/database. Never claim public success from local tests.

Memory index: platform.md (transactions/auth/knowledge/PDF/FSP), frontend.md (UI/browser evidence), operations.md
(deploy/domain/mail/private CI/backups). Earlier product work #31 is closed and verified; do not repeat that audit.
GitHub OAuth deferred; fictional FSP and knowledge tests were explicit product decisions, not unfinished integrations.
