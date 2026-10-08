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

## Known Gaps

Demo email code is not real email identity. FSP, assessment execution and PDF extraction are disclosed simulations.
GitHub OAuth is optional and currently unconfigured on the stand. LLM suggestions never prove qualifications.
Jobs finish inline; there is no durable worker. Candidate search ranks complete collections in memory; measure
capacity before introducing database ranking/caches. No production load or assessment-quality claim is made.

Assessment starts with different idempotency keys also serialize on the candidate row before reading eligibility
and the active attempt; concurrent losers receive `409 assessment_active`, not a storage error.

Last commit: 4c2e28a (implementation and regression snapshot).
