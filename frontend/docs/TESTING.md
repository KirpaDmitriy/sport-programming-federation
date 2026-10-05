# Testing

Four suites check the platform at different levels. All of them run locally; CI
(`.github/workflows/platform.yml`) runs the first three on every change to `contracts/`, `mock-server/` or
`frontend/`.

| Suite | Runner | Where | Count | Command |
| --- | --- | --- | --- | --- |
| Mock API | `bun test` | `mock-server/test/mock-api.test.mjs` | 17 | `bun run --cwd ../mock-server test` |
| Unit and component | Vitest 5 + Testing Library + MSW 3 (jsdom, on Node) | `src/**/*.test.ts(x)` | 31 in 7 files | `bun run test` |
| Browser acceptance | Playwright 1.63 + axe, Chromium 1440×900 | `e2e/*.spec.ts` | 28 + 1 opt-in | `bun run e2e` |
| Deployed stand | Playwright | `e2e/public/stand.spec.ts` | 2 | `FSP_PUBLIC_URL=https://188.166.88.183 bun run e2e:public` |

`bun run verify` runs the codegen check, typecheck, Biome, the FSD layer check, the unit tests, the production build
and the bundle check; `just verify` adds the mock tests. JSON reports go to `test-results/`.

## Mock API tests

HTTP tests against an in-process server, one per rule group: contract drift (the committed `openapi.json` must equal
the generated one), origin/host/role boundaries, the stand configuration (only the configured origin, no
development routes), e-mail verification and expiry, the server-owned category, automatic source jobs without
inferred hours or grades, the assessment lifecycle, failure and service-error outcomes, same-grade retry, downgrade
refusal and cooldown, stale checks and revoked consent, need validation and tenant isolation, the anonymous and
deterministic bank, shortlist persistence, invitations with frozen terms, idempotency and per-company disclosure,
decline and withdrawal, PDF export and import, and scenario resets. `test/contract-coverage.json` records which
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
| `pages/assessment-workspace/workspace-page.test.tsx` | «Черновик сохранён» only after the server acknowledges, failed saves keep the edit, no submission without an explanation |

## Browser acceptance tests

Playwright starts the mock and Vite when they are not running and talks to the real mock through the Vite proxy.
Tests run serially because they share the mock; each resets the scenario it needs through `/__mock__/reset` and
uses one browser context per actor, so a candidate and two companies act at the same time. Names carry the IDs of the
acceptance cases they cover.

| Spec | Cases |
| --- | --- |
| `auth.spec.ts` | Registration with a wrong and an expired code; role separation and deep links that return after sign-in; an expired session clears private data; logout |
| `candidate.spec.ts` | A new candidate reaches a verified category without FSP; the draft survives a reload, an upgrade updates every view and the PDF is real; a failed upgrade keeps Джуниор; a service failure is retryable without penalty; the cooldown comes from the server; automatic source enrichment and empty FSP history; a verified FSP record; graph and list share selection with keyboard access; PDF import applies only on confirmation |
| `employer.spec.ts` | Salary validation, read-only tax basis, saving without publication; filters in the URL with a shortlist that survives filtering and reload; required coverage, verification gaps and verified grade kept apart; no publication, self-application, chat or ATS controls; a search failure is an error with retry; an emptied bank keeps shortlist entries as unavailable |
| `invitations.spec.ts` | Anonymous until acceptance, then only the chosen fields and only for the inviting company; viewing changes only the status and declining grants nothing; a stale tab sees the canonical decision and a withdrawn offer cannot be accepted |
| `accessibility.spec.ts` | No serious or critical axe violations (WCAG 2.2 AA tags) on the login, five candidate and three employer pages; skip link and keyboard navigation; narrow screens without horizontal scroll and with reachable navigation |
| `screenshots.spec.ts` | Opt-in (`SCREENSHOTS=1`): regenerates `docs/screenshots` |

Responses are also inspected: employer-side API bodies must not contain private markers (the seed candidate's name,
e-mail, repository names, references or fixture links) before disclosure.

## Deployed stand

`e2e/public/stand.spec.ts` needs no mock controls: it checks that the HTTPS stand serves the app and deep links
without `/__mock__`, and walks a new candidate and two companies through the whole flow with fresh accounts
(`FSP_DEMO_CODE`, default `123456`). Afterwards `systemctl restart fsp-mock-api` on the host resets the demo data.

## What the tests do not show

They prove contract shapes, state transitions, access rules and the interface against synthetic data. They do not
measure assessment validity, matching quality, real e-mail delivery or production security.
