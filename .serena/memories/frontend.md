# Frontend behavior

## Current Behavior

React/strict TypeScript 7 with FSD and generated contract types. Russian UI; server-owned eligibility, grades,
privacy and state transitions. Assessment saves run in a promise queue; submission waits for acknowledged drafts
and disables editing. Source synchronization tracks the returned job even when it already finished inline,
refreshes derived queries on success and shows failures. The deep-link login test waits for code delivery.
Knowledge workspace uses labelled radio groups, saved response counts and submission confirmation, with no code
editor. Failed tests retain grades; final results review choices and sources and state knowledge-only scope.
PDF preview displays verified excerpts and editable fields; profile changes invalidate stale confirmations.
FSP cards show fictional event/protocol/team details, pending/empty/DQ states and old snapshots beside sync errors.
Unavailable GitHub OAuth is shown as deferred with no active connect control. Result headings/check rows wrap.
The browser helper waits for all 30 radio inputs before selecting answers; a generic group may belong to the
outgoing onboarding route.
Graph generation runs only in graph view, has no automatic retry, and exposes loading/failure/manual retry
in both roles. An errored graph does not remain visible as a stale success.

## Known Gaps

Mock E2E validates disclosed fixtures; public E2E separately validates Rust integration. Documentation screenshots
are opt-in (one skipped test in ordinary runs). Public tests create a unique candidate and use seeded companies;
records persist and must not be reset. Real graph requests can fail and must retain visible retryable errors.

Last commit: a8fc70a (readable result criteria, legacy distinction and evidence vocabulary; delivery in issue #31).
