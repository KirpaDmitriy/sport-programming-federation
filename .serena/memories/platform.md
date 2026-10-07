# Platform behavior

## Current Behavior

Rust/PostgreSQL is the stand implementation; mock is the development behavior reference. OpenAPI includes
74 application operations, health and four mock-only controls. Contract changes update every side together.
Command effects and idempotency response replay commit in one transaction. PostgreSQL serializes per-email
attempt budgets, candidate profile/source/assessment edits, company/shortlist edits and disclosure recomputation.
Viewed flags cannot replace terminal decisions. Commands, graph projections and source ingestion have dedicated
application modules. GitHub tokens are bound to authenticated login; source evidence preserves assessed grades.
Graphs validate model output and derive public labels/status/IDs from known skills, with no employer evidence nodes.

## Known Gaps

Demo email code is not real email identity. FSP, assessment execution and PDF extraction are disclosed simulations.
GitHub OAuth is optional and currently unconfigured on the stand. LLM suggestions never prove qualifications.
Jobs finish inline; there is no durable worker. Candidate search ranks complete collections in memory; measure
capacity before introducing database ranking/caches. No production load or assessment-quality claim is made.

Last commit: 38a741d (implementation and regression snapshot).
