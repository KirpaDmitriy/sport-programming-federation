# Platform behavior

Rust/PostgreSQL implements the stand; the HTTP mock is a development behavior reference. OpenAPI contains
75 application operations, health and four mock-only controls. Update every contract consumer together.
Commands and idempotency replay commit atomically. PostgreSQL serializes email budgets, profile/source/assessment,
company/shortlist and disclosure changes. Viewed flags never replace terminal decisions. Nullable patches and
bounded fields follow the contract. Candidate/company ownership and anonymous projections are server-enforced.

Real email uses the Resend adapter in backend/crates/integration-email: random six-digit codes, 15-minute expiry,
challenge-bound HMAC digests, separate session namespace, single use and five cumulative wrong attempts.
Real-mail issuance allows one/minute and five/15 minutes per normalized address, including provider failures.
Migration 0005 adds created_at/index; never edit earlier SQL. Mandatory production config is validated before
migrations. Enabling/rotating FSP_AUTH_KEY invalidates old credentials without deleting accounts. Demo/mock delivery
remains fixed and has no mailbox-ownership assurance. The realEmail capability describes configuration, not health.

New attempts use knowledge-v2 for every catalog specialization and grade (intern–lead) on its two catalog test
topics; topic banks knowledge-v3-*.json are shared by specializations with the same topic. The attempt id selects
5+5 of six questions per topic, so variants share at least 8/10. Passing requires 8/10 and 3/5 per topic. v1 stays immutable.
Responses/snapshots are immutable at completion; legacy code attempts are archived and never execute.
Assessment start races serialize on the candidate row. Grades, consent and response submission are transactional.
PDF import uses bounded bwrap/prlimit/Poppler extraction, page-cited Bifrost fields and revision-safe confirmation.
The contextual assistant uses saved responses and never grades. Real extraction is a startup/pre-release probe.
Bifrost deadlines are 45 seconds inside the 55-second HTTP and 60-second nginx deadlines; insights calls take 10 seconds.
FSP uses a private fictional HTTP provider. Published participation counts; team results never certify skills.
Failed provider sync preserves snapshots. GitHub connects by login/link through the loopback insights service
(github-insights-v2, docs/github-insights.md): tokenless background analysis of public work (search, REST, blobless
clones) polled through a running source_sync job; developer portrait, own organizations as own work, collaboration
only outside them; ownership by bio code (OAuth optional, deferred), one proven login per candidate, evidence only
from owned/led repos, anonymous rounded employer signal, no grade/order effect.

Limits: public study bank lacks demonstrated leak resistance/professional calibration; model suggestions never
prove qualifications. Jobs finish inline except polled GitHub analyses; search ranks collections in memory. No OCR, durable worker, measured
large-bank capacity or production load claim. Current behavior/limits: docs/current-state.md; latest consistency evidence: #50; prior product completion #31.

Release identity: upstream/main, /opt/fsp/current and deployed.json agree; receipts: #54 (no-backup policy), #67 (GitHub insights).
