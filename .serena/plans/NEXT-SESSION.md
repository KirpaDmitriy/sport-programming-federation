# Project handoff

Read AGENTS.md, docs/current-state.md and domain memories. Source and live evidence override old transcripts.
Backend coordination with Dima, real domain/mail and existing private CI hosts are already authorized.
English engineering text, Russian UI. Never expose secrets, reset production data or rewrite shared history.

## Immediate continuation: CI host was deleted

An external DigitalOcean action deleted gha-runner-1 on 2026-10-11 at 08:16 UTC; runner-2 was retired earlier.
Issue #161 records the interruption. A user question about the replacement destination is pending. Do not install
on unrelated hosts or create a paid droplet without that decision. Main checkout branch feat/159-asset-cache-policy,
PR #160 into danil, contains the locally verified asset-cache fix and incident documentation; it awaits server CI.
Accepted main 405fecc remains live, independently checked healthy. Original gates and public acceptance passed;
the controller upgrade's later recheck was interrupted after platform success. Other build statuses are errors.
The runner's private receipts and PAT copy are unavailable. Rebuild reviewed CI on the selected host, establish
scoped credentials, run all gates and actual public acceptance to regenerate receipts, then ship #160 normally.
After shipping, purge the known cached /assets/missing-header-probe.js response and verify fresh/existing URLs.

## Current behavior

nddev.link serves Rust/PostgreSQL behind Cloudflare Full (strict), with real Resend OTPs and secure sessions.
The original IP redirects to the domain. Applied SQLx migrations must match the source history. Runtime secrets stay on hosts
and in the original ignored .fsp-infra/. FSP is a deliberately fictional private HTTP provider; knowledge tests
replace arbitrary code execution. Digital-PDF extraction and Bifrost assistance are real. GitHub OAuth is deferred.
GitHub connection is real: fsp-github-insights (loopback 4030) analyzes public work without a token in the background
(search, REST, blobless clones); the API enables it with FSP_GITHUB_INSIGHTS_URL in rust-api.env. Method and limits:
docs/github-insights.md. Calibrate rule changes on public accounts only and never toward a desired score.

Automatic profile (owner decision 2026-10-10, docs/auto-profile.md): connecting GitHub and/or FSP answers the
questionnaire and gives an estimated category (estimate-v6: level-framework factors with scope and complexity,
senior 24 and lead 48 months, experience counted from «В IT с какого года» and never filled from public tenure,
lead needs collaboration ≥ 50 or a stated leading role in Russian or English, notes, a growth plan with points and
focus skills; outdated estimates refresh on profile open; «Заполнить анкету по источникам» rebuilds evidence-based
answers; a résumé lets Grok fill the start year with a quote). Edited answers leave autoFields and are never
overwritten. Categories state their source; tests rank first. The Grok review runs in the background with high
reasoning (Bifrost timeout 360 s on the stand), one per candidate, gives growth advice, may pick between close
specializations and lowers high confidence to medium at most. Public acceptance uses failure-safe actor teardown (unpublish candidates, delete fresh-company needs, close contexts). Catalog v2: 25 specializations, 5 grades, 255 skills incl. 1C; every specialization
and grade has a knowledge test (topic banks knowledge-v3-*.json, 1,230 questions, length-balanced distractors).
Live evidence: .fsp-infra/real-features/auto-profile/.

## Completed work and current evidence

Earlier completed deliveries: #16 (stability), #23/#27 (browser), #31 (knowledge/PDF/FSP), #38/#40 (domain/mail/CI),
#50 (consistency). Their backup/restore receipts are historical and do not authorize new archives.
Documentation screenshots use fictional data; public acceptance reads actual mail. Three disclosed synthetic
accounts intentionally keep fixed codes in Resend mode; all other addresses require real mail.

## Delivery and recovery

CI recovery layout: /opt/fsp-ci, root-private /etc/fsp-ci, fsp-ci.timer. No current host after #161. Four fsp/* gates plus independent
security checks protect personal -> dev -> main PRs. Installed controller updates are reviewed separately and
invalidate cached proof. Trusted private maintainers only; Docker is root-equivalent. No GitHub Actions dependency.
After recovery, current main must match /opt/fsp/current and newly accepted /var/lib/fsp-ci/deployed.json; fsp/deployment succeeds only
after real public browser acceptance. Compare local/canonical permanent branches individually; never reset them to a common SHA.
The additional GitHub mirror is retired and must not be synchronized. Preserve compatible Rust rollback targets; never revert public auth to mock/demo.

Owner standard (#54): no backups, snapshots or redundant copies unless explicitly requested later.
FSP backup units are stopped/masked; provisioning and CI must not recreate archives. Existing server/local
backup archives were deleted. Older backup/restore receipts above are historical, not a standing task.
No OpenObserve or external alerting exists: inspect systemd/nginx and CI logs. Other explicit limits are in
current-state.md: no calibrated/leak-resistant exam, OCR, durable source queue, high availability or load claim.
October 11 review #138: consent parity on interview answers, one model budget per turn, same-origin microphone
policy, race-safe speech lifecycle and failure-safe acceptance teardown. Detailed plan and evidence scope:
docs/stability-review-2026-10-11.md. Documentation and project-specific Claude/Serena memories were reconciled.
Follow-up #139 installed a separate repo-only classic CI PAT after owner-authorized browser issuance. The original
shared CLI credential is unchanged. Its dedicated replacement expires November 10, 2026 at 06:31:54 UTC, but the
only known active copy was lost with runner-1. Recover or replace it through infra/ci/README.md; never print it.
Installer 23aad65 shipped through #143/#144/#145; #139 records token and PR-cycle proof. Follow-up #152/#153/#154/#155
adds status reconciliation (e078301), error-response cleanup (b3f80bf), queued-review consent (c93cf00) and HTTPS headers
(63bb5eb). Public probes found #159 asset-404 caching; f6d2f70 limits immutable caching to 200/206/304. Local checks: 129 Rust, 20 CI tests, release faults and real nginx. Read issue receipts for live/install proof.

Memory index: platform.md (auth/data/assessment), frontend.md (UI/proofs), operations.md (deployment/mail/CI/recovery).
Release identity: compare upstream/main, /opt/fsp/current and deployed.json instead of trusting a SHA written here.
Receipts: #54 (no-backup policy), #67 (GitHub insights delivery and live check), #73 (catalog v2),
#76/#79 (automatic profile, background review), #82 (question banks, estimate-v2), estimate-v3 #89, estimate-v4 #95, estimate-v5 #125 (Russian leading-role spellings), estimate-v6 (experience from the start year in IT).

## Pending service shutdown correction (#162)

PR #163 into danil uses worktree .fsp-infra/worktrees/162-graceful-shutdown and branch feat/162-graceful-shutdown
from upstream/dev. Independent code review passed; it is not live verification.
Implementation 0f5070a handles SIGTERM as well as SIGINT in interview/simulator/insights; the API already did so.
Follow-up b56bcff propagates signal-registration errors from all four composition roots before axum spawns its
shutdown task. API/interview systemd and web/API/interview Compose stop grace is 60 seconds. The old binary failed the real
pending-answer regression; both signals now finish HTTP, save revision/evidence (1,1), then exit successfully.
Local Rust fmt/clippy and 131 tests passed; release fault checks and four auxiliary-binary signal probes passed.
This change is not deployed. Restore CI (#161), ship #160, reconcile this branch with the updated personal branch
without rewriting history, then run its gates and public acceptance before merging/releasing it. Sequential
restarts can still reject new requests; process-local background jobs are not made durable by HTTP draining.
