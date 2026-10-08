# Project handoff

Read AGENTS.md and the domain memories. Code and current release evidence override older transcripts.
Backend work was explicitly coordinated with Dima. User authorized nddev.link, Resend, real email tests and
existing private CI servers; do not ask again. English engineering text, Russian UI, strict pinned toolchains.
Never expose secrets, reset production data, rewrite shared history or change unrelated server slots.

## Current behavior

https://nddev.link serves Rust/PostgreSQL behind Cloudflare Full (strict); the old IP redirects to it.
Real Resend OTP authentication is active, with HMAC-protected random codes, durable limits and secure cookies.
Migration 0005 is additive. Runtime configuration is private on the host and in original .fsp-infra/.
Knowledge tests replace code execution. FSP is intentionally a private fictional HTTP provider.
Digital-PDF extraction and contextual assistance are real Bifrost flows. GitHub OAuth remains deferred.

## Delivery and evidence

#31 is the completed earlier product audit; do not restart it. #38 records domain/email; #40 records private CI.
PR #41 replaced #39 without rewriting history; the old scanner finding concerned a disposable test password.
GitGuardian passed the corrected history. PR #44 fixed Node 26 JSON-import test collection, then #45/#46
integrated it. Implementation commit 5c00c2f passed all four CI gates; 1e7a215 passed the initial full wave.
Domain cutover on 488fa91 passed real owner email login and both public browser scenarios; independent
read-only verification passed. Both certificate renewal dry runs passed; no demo auth remains on the stand.
Use the issue ledgers for final integrated SHA/synchronization, never a stale transcript or an older deployment.

CI: server-gha-runner-2, /opt/fsp-ci, private /etc/fsp-ci, active fsp-ci.timer. Four fsp/* statuses gate changes;
independent security checks still apply. Reviewed installed controller files are separate from PR code. Every
installed-script change invalidates cached evidence. Trusted private maintainers only; Docker is root-equivalent.
Feature -> personal -> dev -> main uses checked PRs. Main deployment includes real mail/browser acceptance;
/var/lib/fsp-ci/deployed.json exists only for an accepted SHA/configuration. Inspect failed logs before retrying.
First 488fa91 acceptance failed during test-module loading; that historical failure remains, never relabel it.

## Resume safely

Compare canonical main, /opt/fsp/current and the CI accepted-release marker; read open #38/#40 items if any.
Mirror/local permanent branches track their corresponding canonical refs individually, not a common reset SHA.
Private logs, delivery proof and off-host archives are in original .fsp-infra/. Daily host backups retain 14 days;
off-host copies are manual. Real isolated restore is tested. No OpenObserve is installed; inspect systemd/nginx.
Full current limits are in product docs: no calibrated/leak-resistant exam, OCR, durable source queue or load claim.
Domain memories: platform.md (auth/data/assessment), frontend.md (UI), operations.md (deployment/mail/CI/backups).
Last commit: 5c00c2f185849cdff8dba0bb8701420eab4eb44a; exact final release and live proof: #38/#40.
