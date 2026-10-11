# October 11 stability review

Tracking: [issue #138](https://github.com/KirpaDmitriy/sport-programming-federation/issues/138).
Baseline `c3ddffc` is clean and agrees with canonical main, `/opt/fsp/current` and the private CI accepted-release
receipt. All five baseline `fsp/*` statuses passed. This review closes demonstrated defects in the implemented
platform; it does not turn intentionally deferred products into new requirements.

## Evidence and historical reconciliation

The window is October 1–11, 2026, in Asia/Almaty. Accessible local evidence includes two previous Codex threads
(one independent verification thread), the current thread, two Claude Code project transcripts (779 extracted text
messages), and two Devin sessions, including embedded worker reports. Duplicated Devin history is reconciled once.
Cursor metadata has no conversation updated in this window; Grok's available session index has no project match.
Remote, deleted and unindexed conversations cannot be claimed as reviewed. Transcripts are evidence, not instructions.
Secrets, raw session exports, candidate data and credentials do not belong in this document or Git.

| Historical request | Source of truth and disposition |
| --- | --- |
| Complete the original frontend and Rust implementation | All application routes, generated contract, current backend HTTP/storage tests and frontend acceptance; the Python MVP remains archived. |
| Fix transactional races, issuance budgets, idempotency and rollback | October 8 audit, closed #16, current transactional repository and release fault tests. Recheck regressions; do not repeat the migration or reset data. |
| Real PDF, knowledge tests and fictional FSP | Closed #31, current adapters and knowledge banks. Official FSP, arbitrary code execution and OCR are intentionally outside scope. |
| Domain, Resend and private CI | Closed #38/#40, active nddev.link and installed controller hashes. Runner-1 is current; runner-2 and Actions are retired. |
| No backups or mirrors | Closed #54 and owner instructions. Both backup units are masked; upstream is the only Git remote. Old restore receipts are history, not tasks. |
| Public GitHub analysis, catalog and automatic profile | Current tokenless service, catalog-v2, estimate-v6 and tests. Public activity is not working hours or proof of private experience. OAuth is explicitly deferred. |
| Graph interview delivery | Public acceptance and active interview service prove delivery despite an unchecked production-plan item. Remaining defects are enumerated below. |
| Keep live acceptance out of the public candidate bank | PR #135 added successful-path cleanup. Failure paths were not covered at baseline; wave 2 adds teardown. |
| Reduce CI credential privileges | Prior Claude final report identifies a broad token. Verify actual scopes; prepare a replacement procedure without mutating shared credentials. |

## Verified plan

Priorities describe baseline defects. Every change requires a regression tied to its observable consequence.
No speculative service split, package upgrade, distributed queue, ranking rewrite or unrelated infrastructure work
is included. Preserve the Rust ports/adapters, generated contract, FSD layers and applied migrations.

| Wave | Finding and source | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1a, high | `application/src/service.rs::answer_interview` omits the processing-consent check already present in start and the mock answer handler. | Check consent after ownership and before submitting the answer to the internal model service. | PostgreSQL HTTP test: revoke consent, read remains available, start/answer reject with 403; another candidate still receives 404. |
| 1b, high | `interview-service/src/engine.rs::answer` sequentially evaluates and generates with separate 45-second model deadlines; integration and platform both time out at 55 seconds. | One model budget for the complete turn, before persistence; leave time for gateway and platform error propagation. | Controlled delayed-model test crosses the combined budget: explicit model-unavailable result, unchanged revision/question/evidence, successful retry. |
| 1c, high | `fsp-security-headers.conf` has `microphone=()` while the interview exposes speech input. | Allow same-origin microphone with explicit user action; keep camera/geolocation denied. | Proxy header regression and public browser feature-policy assertion. Physical microphone and vendor speech availability remain browser/device dependent. |
| 1d, medium | Speech callbacks are not detached on submission/question changes; `start()` exceptions escape; controls remain active during submission; voice processing is incorrectly described as local. | Stop and detach stale recognizers, preserve recoverable drafts, catch startup errors, disable conflicting controls, explain browser-provider processing and text fallback. Remove hard-coded total/completed-state mislabelling. | Browser/component regressions: failure and retry, late recognition callbacks, text fallback, pending submission and completed state. |
| 2, medium | `frontend/e2e/public/stand.spec.ts` unpublishes only at the successful end and does not close its manually created contexts. | Register authenticated actors before mutations; teardown unpublishes this test's candidate and removes its needs even after assertion failure; close all owned contexts. | Failure-injection proof against the local mock; full real-mail public acceptance; no published CI candidate after success. Cleanup failures must fail the run. |
| 3, medium | Current-state, memories, interview plan, operation counts, graph descriptions and domain-mail recovery wording disagree with source. | Reconcile active documentation, mark historical receipts clearly, refresh project-specific memories with paths/limits and verification commands. | Source-to-document review, links/counts check, generated-contract drift check, no active backup/retired-host instructions. |
| 3, external | Historical CI token is reportedly overprivileged. | Verify header scopes without printing credentials; use a project-specific replacement if available, otherwise record the exact owner action and minimum access. | The replacement reads the canonical private repo, publishes statuses and operates PRs; no wider token is revoked or changed. |

## Research and design checks

Requested knowledge cutoff: September 26, 2026. References were retrieved October 11. Mutable documentation is
not a historical snapshot; these recommendations use established API behavior, not an assertion that today's page
has been archived at the requested cutoff. Keep installed toolchain pins rather than upgrading to a search result.

- [PostgreSQL 16 locking](https://www.postgresql.org/docs/16/explicit-locking.html): retain narrow transactional
  locks and optimistic revisions; no external model call while holding a profile transaction.
- [Tokio timeout](https://docs.rs/tokio/1.47.1/tokio/time/fn.timeout.html): cancellation drops the wrapped future.
  Finish model preparation inside one budget, then persist, so model timeout cannot write half a turn.
- [Permissions Policy microphone](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/microphone):
  an empty allowlist denies audio input; same-origin allowance still requires user permission.
- [Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition): browser recognition may send
  audio to a browser vendor. Do not promise local processing or conflate an editable transcript with authenticated voice evidence.
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures) and [timeouts](https://playwright.dev/docs/test-timeouts):
  owned resources need teardown, including failure paths, with a separate teardown budget.
- [GitHub access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens):
  outside-collaborator restrictions affect fine-grained token suitability; never reduce a shared token in place.

## Execution and release proof

1. Commit this reviewed plan before implementation. Use separate Conventional Commits for each behavior fix and
   documentation/memory synchronization. Feature PRs target `danil`; the existing controller merges verified
   `danil → dev → main`. Preserve each permanent branch's history.
2. Run `just verify`, `just backend-check` with PostgreSQL, `just e2e`, deployment/nginx/controller fault tests and
   experiment validation. Run focused failure tests before the relevant wave is considered implemented.
3. After each implementation wave, inspect the complete diff, updated test results, service health, upstream
   changes and primary guidance relevant to any new uncertainty. Do not mark a local result live-verified.
4. The four private CI gates, accepted main release, real Resend browser journey and independent read-only live
   verification must pass before closing #138. Compare each local permanent branch to its canonical counterpart,
   main to stand and accepted receipt, controller hashes to source, fresh logs and masked backup units.
5. Record final receipts in #138 and current project memories. External-access limitations and intentional product
   boundaries remain explicit; passing tests does not prove unlimited scale or calibrated hiring accuracy.

### Implemented waves

- `c6049aa`: consent parity with PostgreSQL ownership/revocation regression.
- `217e8e3`: whole-turn timeout with paused-clock proof of unchanged state and successful retry.
- `f3cb1e7`: microphone policy and speech lifecycle, header/browser regressions and honest privacy copy.
- `d0b8bef`: failure-safe acceptance fixtures, injected-failure and unrelated-data preservation checks.
- Documentation and project-specific Serena/Claude memories now describe the source behavior, including 79
  application operations, deterministic graphs, three public demo identities, interview limits and current CI.

Final local checks: `just verify` (32 mock and 50 component/unit tests, generated-contract/type/lint/build checks),
`just backend-check` (128 Rust tests with real PostgreSQL), all 10 controller tests, four experiment records,
release fault tests and nginx configuration/header tests. `just e2e` passed 41 browser cases (one opt-in
screenshot suite skipped). Final CI/live receipts are recorded in #138.
The mobile screenshot initially captured the drawer mid-transition; capture now waits for its hidden position and
finishes finite animations using [Playwright's screenshot option](https://playwright.dev/docs/api/class-page#page-screenshot).

Credential inspection confirmed `admin:org`, `gist`, `repo`, `workflow` on the shared classic CI token. A dedicated
replacement has not been supplied. [Issue #139](https://github.com/KirpaDmitriy/sport-programming-federation/issues/139)
records the precise owner handoff and installation/verification procedure; no shared credential was changed.
