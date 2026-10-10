# Backend implementation status

Current implementation, verified during the [October 8 stability audit](stability-audit.md).
Historical cutover commands for another contributor's server are not operating instructions for this stand.

## Implemented

- Rust hexagonal architecture: domain/application ports, axum transport, PostgreSQL and outbound adapters.
- All 75 application operations plus `/health`; no production `/__mock__` controls.
- Persisted accounts, sessions, profiles, consents, needs, vacancies, invitations, applications, shortlists,
  tasks, assessments, graph interviews, sources and jobs. Roles and tenant boundaries are enforced by the API.
- Atomic idempotent commands and response replay; shared email attempt budgets; guarded terminal decisions;
  serialized disclosure and shortlist mutations; profile/assessment/source concurrency protection.
- Candidate visibility, deterministic ranking, filters, server-returned pagination and anonymous projections.
- GitHub connection by login through the tokenless public-only insights service as a polled background job,
  ownership by bio code or OAuth identity, and evidence updates from substantively developed repositories that
  preserve verified grades.
- Automatic profile (`estimate-v2`): every source write recomputes the estimate in its transaction, answers the
  questionnaire fields still automatic and gives an estimated category; a bounded Bifrost second opinion; manual
  recalculation; category source and confidence in search, ranking, applications and weekly tasks.
- Optional Bifrost graph extraction with structural/reference validation and safe employer projection.
- Graph-guided candidate interviews through an internal Rust service: authenticated platform routes, PostgreSQL
  sessions with optimistic revisions, an offline CPU rubric, optional Bifrost generation/evaluation and local-only
  browser speech playback.
- Real PDF export/import, revision-checked preview confirmation, contextual Bifrost assistance, source/job privacy and capability flags.
- Bounded Resend delivery, per-email issuance limits, cumulative wrong-code budgets and challenge/session HMAC separation.
- Rustfmt, clippy, unit tests and PostgreSQL HTTP/storage regressions; private-server CI gates cover admitted canonical PRs.

## Explicit demo limits

- Public authentication uses actual Resend delivery, random single-use codes and keyed digests. Local `demo`
  mode retains the disclosed fixed code; demo verification is not mailbox ownership proof.
- FSP uses a separate fictional HTTP provider with bounded validation, published/pending/disqualified results
  and durable snapshots. No official API, identity verification or dataset is implied.
- Knowledge tests use a versioned server-side bank and deterministic scoring. The public study bank is not
  leak-resistant or professionally calibrated. Legacy simulated code attempts remain archived; no code executes.
- Contextual assistant replies call Bifrost and never decide grades.
- Interview evidence is an adaptive rubric signal, not a calibrated hiring score. The shipped graph covers one
  backend-middle blueprint; video, camera analysis and biometric or inferred-personality scoring are intentionally absent.
- PDF import extracts digital text in a bounded Poppler sandbox; scans/OCR are unsupported. Bifrost fields require actual page excerpts and user confirmation.
- Jobs complete inline in Rust; there is no durable background worker.
- Repository/competition matching has an adapter port but no product workflow. Graph relations are model
  suggestions, not independently verified qualification evidence.
- Search still ranks complete lists in memory. No distributed scaling or measured capacity claim is made.

## Delivery evidence

The public stand is `https://nddev.link` (origin `188.166.88.183`), managed by [`infra/`](../infra/README.md). Main is deployed through
feature → personal → dev → main with successful checks. Release activation rollback has automated probes. Backup creation is disabled by owner policy. Public browser acceptance and exact stand/main SHA verification are recorded in the
[audit execution log](stability-audit.md#execution-log); local tests alone do not imply successful deployment.

Code and current verification results take precedence over a checked historical task.
