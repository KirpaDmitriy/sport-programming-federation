# Project handoff

## Current law

Code is the source of truth. Read AGENTS.md, subtree rules and docs/stability-audit.md. English engineering text,
Russian UI, pinned Rust/TypeScript 7/Bun. Backend audit fixes were coordinated with Dima and explicitly authorized.
Do not reset stand data, rotate credentials, create a second droplet or modify unrelated hosts. Preserve the user's
no-attribution preference. Work in a feature branch and follow personal → dev → main with required green checks.

## Completed implementation

- af52e15: evidence-backed plan and accessible session inventory.
- 56053f0 / 23b1fda: immutable releases/recovery, retryable provisioning and verified backups.
- 18a5a2a: fail-closed cascade checks and exact-SHA deployment gates.
- 9b858ca / 9507336: ordered assessment saves and inline source job handling.
- 25ff006 / a0765c5 / 3ba089d: durable auth budget, atomic command replay and concurrent aggregate protection.
- cfcb4d0 / f3aecfc: GitHub identity, safe graph projection and atomic source evidence.
- 0e29a81 / 3f45fdb: strict storage parsing/migration rebuilds and command documentation.
- db581b2: immediate structured nginx authentication limits.
- 1be7311: bounded company fields, HTTP(S) websites, strict email format and correct nullable PATCH semantics.
- 92c582d: current product/operating documentation; 38a741d: deterministic login E2E ordering.

## Verification and delivery record

Local gates passed: just verify (25 mock, 34 component tests), just backend-check (23 HTTP, 10 repository tests
plus unit/adapter tests), seven release fault scenarios, cascade tests, actual nginx rate-limit probe and real
PostgreSQL backup restore. Full browser suite has 34 cases plus one intentionally opt-in screenshot; a mailbox
race discovered in a later local run was fixed and all five auth tests passed three repetitions (15/15).
All gates, including the full browser suite, must pass on the final PR head.

[PR #17](https://github.com/KirpaDmitriy/sport-programming-federation/pull/17) carries the implementation.
[Issue #16](https://github.com/KirpaDmitriy/sport-programming-federation/issues/16) is the final delivery ledger:
its checked list and closure record canonical/mirror/local permanent refs, active stand SHA, public browser,
real LLM/privacy checks and independent read-only verification. Read it before resuming; do not repeat completed
work based on an older session summary. If still open, finish its unchecked delivery steps. If closed, there is
no uncompleted stabilization action in this audit. Follow-up product limits are documented, not hidden defects.

## Scope and next decisions

Accessible history: current Codex, one Claude transcript, two Devin sessions in the ten-day window. No local
project match in Grok/Cursor indexes; remote/deleted history could not be audited. Original session logs were not
rewritten. Project-specific Claude memories were reconciled; preference memories were preserved.

No implementation step is blocked on the user. Production email identity, official FSP, real code execution/PDF
extraction, off-host backup destination and measured large-bank scaling require separate explicit product or
operating decisions. Do not silently claim these capabilities or enable paid external services.
