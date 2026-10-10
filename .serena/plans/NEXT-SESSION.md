# Project handoff

Read AGENTS.md, docs/current-state.md and domain memories. Source and live evidence override old transcripts.
Backend coordination with Dima, real domain/mail and existing private CI hosts are already authorized.
English engineering text, Russian UI. Never expose secrets, reset production data or rewrite shared history.

## Current behavior

nddev.link serves Rust/PostgreSQL behind Cloudflare Full (strict), with real Resend OTPs and secure sessions.
The original IP redirects to the domain. Six additive migrations are applied (0006: estimate and auto fields). Runtime secrets stay on hosts
and in the original ignored .fsp-infra/. FSP is a deliberately fictional private HTTP provider; knowledge tests
replace arbitrary code execution. Digital-PDF extraction and Bifrost assistance are real. GitHub OAuth is deferred.
GitHub connection is real: fsp-github-insights (loopback 4030) analyzes public work without a token in the background
(search, REST, blobless clones); the API enables it with FSP_GITHUB_INSIGHTS_URL in rust-api.env. Method and limits:
docs/github-insights.md. Calibrate rule changes on public accounts only and never toward a desired score.

Automatic profile (owner decision 2026-10-10, docs/auto-profile.md): connecting GitHub and/or FSP answers the
questionnaire and gives an estimated category (estimate-v4 adds the growth plan, focus skills and Grok advice
with high reasoning; outdated estimates refresh on profile open; estimate-v3: level-framework factors with scope and complexity,
senior 24 and lead 48 months, stated experience never lowers evidence, lead needs collaboration ≥ 50 or a stated
leading role, notes explain caps; «Заполнить анкету по источникам» rebuilds answers).
Edited answers leave autoFields and are never overwritten. Categories state their source; tests rank first. The Grok
second opinion runs in the background after commit (live answers take over 20 s) and only lowers confidence or picks
between close specializations. Catalog v2: 25 specializations, 5 grades, 255 skills incl. 1C; every specialization
and grade has a knowledge test (topic banks knowledge-v3-*.json, 1,230 questions, length-balanced distractors).
Live evidence: .fsp-infra/real-features/auto-profile/.

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
Release identity: compare upstream/main, /opt/fsp/current and deployed.json instead of trusting a SHA written here.
Receipts: #54 (no-backup policy), #67 (GitHub insights delivery and live check), #73 (catalog v2),
#76/#79 (automatic profile, background review), #82 (question banks, estimate-v2), estimate-v3 #89, estimate-v4 PR (see GitHub).
