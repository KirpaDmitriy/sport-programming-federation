# Project handoff

Read AGENTS.md, docs/current-state.md and domain memories. Source and live evidence override old transcripts.
Backend coordination with Dima, real domain/mail and existing private CI hosts are already authorized.
English engineering text, Russian UI. Never expose secrets, reset production data or rewrite shared history.

## Current behavior

nddev.link serves Rust/PostgreSQL behind Cloudflare Full (strict), with real Resend OTPs and secure sessions.
The original IP redirects to the domain. Five additive migrations are applied. Runtime secrets stay on hosts
and in the original ignored .fsp-infra/. FSP is a deliberately fictional private HTTP provider; knowledge tests
replace arbitrary code execution. Digital-PDF extraction and Bifrost assistance are real. GitHub OAuth is deferred.

## Completed work and current evidence

#16, #23/#27 and #31 are completed earlier audit/product deliveries. #38/#40 completed domain/mail/private CI
on cd44951: all four gates, both real-email browser scenarios, independent live verification, ref synchronization
and actual off-host archive restore passed. Historical failure 488fa91 and superseded PR39 are retained as history.

#50 is the subsequent consistency review: live/frontend/backend docs, demo instructions, build helper and screenshot
capture were reconciled against source. Read its final issue receipt and git log for the integrated SHA.
The screenshot suite uses fictional mock data; it is not live-auth evidence. Public acceptance reads actual mail.
Do not restart completed audits or revive the old IP/fixed-code/Actions instructions.

## Delivery and recovery

CI: server-gha-runner-2, /opt/fsp-ci, root-private /etc/fsp-ci, fsp-ci.timer. Four fsp/* gates plus independent
security checks protect personal -> dev -> main PRs. Installed controller updates are reviewed separately and
invalidate cached proof. Trusted private maintainers only; Docker is root-equivalent. No GitHub Actions dependency.
Current main must match /opt/fsp/current and accepted /var/lib/fsp-ci/deployed.json; fsp/deployment succeeds only
after real public browser acceptance. Compare local/canonical permanent branches individually; never reset them to a common SHA.
The additional GitHub mirror is retired and must not be synchronized. Preserve compatible Rust rollback targets; never revert public auth to mock/demo.

Owner standard (#54): no backups, snapshots or redundant copies unless explicitly requested later.
FSP backup units are stopped/masked; provisioning and CI must not recreate archives. Existing server/local
backup archives were deleted. Older backup/restore receipts above are historical, not a standing task.
No OpenObserve or external alerting exists: inspect systemd/nginx and CI logs. Other explicit limits are in
current-state.md: no calibrated/leak-resistant exam, OCR, durable source queue, high availability or load claim.
No pending user permission is needed for the completed scope. Read current open issues for new work.

Memory index: platform.md (auth/data/assessment), frontend.md (UI/proofs), operations.md (deployment/mail/CI/recovery).
Last commit: 5ff1527ab772df15fab3fa6cd4598ed84d5e4e3b (accepted baseline); current no-backup policy/receipt: #54.
