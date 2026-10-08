# Platform behavior

## Current Behavior

Rust/PostgreSQL is the stand implementation; mock is the development behavior reference. OpenAPI includes
74 application operations, health and four mock-only controls. Contract changes update every side together.
Command effects and idempotency response replay commit in one transaction. PostgreSQL serializes per-email
attempt budgets, candidate profile/source/assessment edits, company/shortlist edits and disclosure recomputation.
Viewed flags cannot replace terminal decisions. Commands, graph projections and source ingestion have dedicated
application modules. GitHub tokens are bound to authenticated login; source evidence preserves assessed grades.
Company/profile/need patches distinguish omitted fields from explicit null; only website and experienceMonths
are nullable. Company fields follow contract bounds; websites require HTTP(S), and email format matches the mock.
Graphs validate model output and derive public labels/status/IDs from known skills, with no employer evidence nodes.
Bifrost and GitHub analysis retain 45-second integration ceilings, inside the 55-second API guard and
60-second nginx deadlines. Virtual-time tests preserve successful/bounded-failure responses at 45 seconds.

## Known Gaps

Knowledge tests use immutable knowledge-v1 snapshots (10 questions per backend grade, five Rust/five PostgreSQL),
server-held correct choices and deterministic thresholds: 8/10 and 3/5 each. Incorrect/incomplete/foreign answers
cannot pass; legacy code attempts are archived read-only. Same-grade successes refresh profile evidence without
resetting grade-change cooldown. Correct answers/explanations appear only in final result DTOs.
PDF import uses bounded bwrap/prlimit/Poppler extraction, Bifrost fields validated against page excerpts, and
revision/consent-checked atomic confirmation. Assistant calls Bifrost with actual saved responses; it never grades.
FSP connect/sync uses a private HTTP simulator with fictional published/pending/disqualified/empty records.
Only published participation counts; team results never confirm skills/grades. Failed sync preserves snapshots.
Demo email is not real identity; email delivery and GitHub OAuth setup are explicitly deferred by the user.
The public study bank has no demonstrated leak resistance or professional calibration. LLM suggestions never prove qualifications.
Jobs finish inline; there is no durable worker. Candidate search ranks complete collections in memory; measure
capacity before introducing database ranking/caches. No production load or assessment-quality claim is made.

Assessment starts with different idempotency keys also serialize on the candidate row before reading eligibility
and the active attempt; concurrent losers receive `409 assessment_active`, not a storage error.

Last commit: 89f0a2b (knowledge/PDF/assistant/FSP implementation; delivery ledger is issue #31).
