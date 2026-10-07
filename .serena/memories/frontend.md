# Frontend behavior

## Current Behavior

React/strict TypeScript 7 with FSD and generated contract types. Russian UI; server-owned eligibility, grades,
privacy and state transitions. Assessment saves run in a promise queue; submission waits for acknowledged drafts
and disables editing. Source synchronization tracks the returned job even when it already finished inline,
refreshes derived queries on success and shows failures. The deep-link login test waits for code delivery.

## Known Gaps

Mock E2E validates disclosed fixtures; public E2E separately validates Rust integration. Documentation screenshots
are opt-in (one skipped test in ordinary runs). Public tests create a unique candidate and use seeded companies;
records persist and must not be reset. Real graph requests can fail and must retain visible retryable errors.

Last commit: 38a741d (15 repeated auth checks passed; complete CI suite required on each PR head).
