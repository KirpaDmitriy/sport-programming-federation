# Testing

These suites check the frontend and mock. CI (`.github/workflows/platform.yml`) runs on every push and PR.
Rust/PostgreSQL behavior is checked separately by `just backend-check`; deployment recovery and backup/restore
are checked by `.github/workflows/infra.yml`.

| Suite | Runner | Where | Count | Command |
| --- | --- | --- | --- | --- |
| Mock API | `bun test` | `mock-server/test/mock-api.test.ts` | 24 | `bun run --cwd ../mock-server test` |
| Unit and component | Vitest 5 + Testing Library + MSW 3 (jsdom, on Node) | `src/**/*.test.ts(x)` | 34 in 8 files | `bun run test` |
| Browser acceptance | Playwright 1.63 + axe, Chromium 1440×900 | `e2e/*.spec.ts` | 34 + 1 opt-in | `bun run e2e` |
| Deployed stand | Playwright | `e2e/public/stand.spec.ts` | 2 | `FSP_PUBLIC_URL=https://188.166.88.183 bun run e2e:public` |

`bun run verify` runs the codegen check, typecheck, Biome, the FSD layer check, the unit tests, the production build
and the bundle check; `just verify` adds the mock tests. JSON reports go to `test-results/`.

## Mock API tests

HTTP tests against an in-process server, one per rule group: contract drift (the committed `openapi.json` must equal
the generated one), the error-code catalog (every code, status and literal message the mock raises is listed in
`contracts/error-codes.json`), origin/host/role boundaries, the stand configuration (only the configured origin, no
development routes), e-mail verification and expiry, the server-owned category, automatic source jobs without
inferred hours or grades, the assessment lifecycle, failure and service-error outcomes, same-grade retry, downgrade
refusal and cooldown, stale checks and revoked consent, need validation and tenant isolation, the anonymous and
deterministic bank, shortlist persistence, invitations with frozen terms, idempotency and per-company disclosure,
decline and withdrawal, vacancy publication and the candidate feed, applications with frozen terms, eligibility,
disclosure and its withdrawal, weekly task offers, answers, reviews and profile freshness, task authoring and
archiving, PDF export and import, and scenario resets. `test/contract-coverage.json` records which
operations and statuses were exercised.

## Unit and component tests

MSW intercepts requests at `http://localhost:3000` (`VITE_API_ORIGIN` in tests) and fails on any unhandled request.

| File | Covers |
| --- | --- |
| `shared/api/errors.test.ts` | Error envelope, non-JSON errors, missing bodies, human messages, field mapping |
| `pages/employer-need-editor/need-form.test.ts` | Whole-ruble salary parsing and rejection of malformed input, reversed ranges, requirement rules, the request payload |
| `entities/qualification/ui.test.tsx` | Verified grade never shown without verification; target kept apart |
| `features/shortlist-membership/use-membership.test.tsx` | Optimistic add rolled back on rejection; removal reflected everywhere |
| `features/respond-invitation/invitation-decision.test.tsx` | At least one disclosed field, exactly the chosen fields sent, conflicts keep contacts closed, no decision on a withdrawn invitation |
| `pages/login/login-page.test.tsx` | Address validation, wrong-code recovery, role conflict |
| `pages/assessment-workspace/workspace-page.test.tsx` | Acknowledged and failed saves, serialized overlapping edits, submission prerequisites |
| `features/connect-source/use-source-processing.test.tsx` | Inline terminal jobs refresh derived data and expose failures |

## Browser acceptance tests

Playwright starts the mock and Vite when they are not running and talks to the real mock through the Vite proxy.
Tests run serially because they share the mock; each resets the scenario it needs through `/__mock__/reset` and
uses one browser context per actor, so a candidate and two companies act at the same time. Names carry the IDs of the
acceptance cases they cover.

| Spec | Cases |
| --- | --- |
| `auth.spec.ts` | Registration with a wrong and an expired code; role separation and deep links that return after sign-in; an expired session clears private data; logout |
| `candidate.spec.ts` | A new candidate reaches a verified category without FSP; the draft survives a reload, an upgrade updates every view and the PDF is real; a failed upgrade keeps Джуниор; a service failure is retryable without penalty; the cooldown comes from the server; automatic source enrichment and empty FSP history; a verified FSP record; graph and list share selection with keyboard access; PDF import applies only on confirmation |
| `employer.spec.ts` | Salary validation, read-only tax basis, saving without publication; filters in the URL with a shortlist that survives filtering and reload; required coverage, verification gaps and verified grade kept apart; publication only on the needs list and no chat or ATS controls; a search failure is an error with retry; an emptied bank keeps shortlist entries as unavailable |
| `invitations.spec.ts` | Anonymous until acceptance, then only the chosen fields and only for the inviting company; viewing changes only the status and declining grants nothing; a stale tab sees the canonical decision and a withdrawn offer cannot be accepted |
| `vacancies.spec.ts` | Publishing and unpublishing a need, the candidate feed with filters, salary and fit; applying opens only the chosen contacts to that company, which views and accepts while the candidate follows the status; withdrawing takes the contacts back; a candidate without a verified grade is told why applying is unavailable |
| `tasks.spec.ts` | The weekly task is answered once, reviewed by its company with a comment and makes the profile fresh for every company, while the answer stays with the author; companies add and archive tasks with validation; a candidate without a verified grade is told why there is no task |
| `accessibility.spec.ts` | No serious or critical axe violations (WCAG 2.2 AA tags) on the login, nine candidate and seven employer pages; skip link and keyboard navigation; narrow screens without horizontal scroll and with reachable navigation |
| `screenshots.spec.ts` | Opt-in (`SCREENSHOTS=1`): regenerates `docs/screenshots` |

Responses are also inspected: employer-side API bodies must not contain private markers (the seed candidate's name,
e-mail, repository names, references or fixture links) before disclosure.

## Deployed stand

`e2e/public/stand.spec.ts` needs no mock controls: it checks that the HTTPS stand serves the app and deep links
without `/__mock__`, and walks a new candidate and two companies through the whole flow with fresh accounts
(`FSP_DEMO_CODE`, default `123456`). These accounts and records persist in PostgreSQL. The suite uses unique addresses and does not reset or delete
stand data. A mock restart has no effect on Rust data.

## What the tests do not show

They prove contract shapes, state transitions, access rules and the interface against synthetic data. They do not
measure assessment validity, matching quality, real e-mail delivery or production security.
