# ФСП / Карьера — frontend

React application for the FSP reverse-hiring platform: candidates confirm a specialization and grade through an
assessment and receive salary-bearing invitations; employers describe needs, search an anonymous categorized bank,
keep shortlists and invite a specific person. The UI talks to the proposed OpenAPI contract in
[`../contracts/openapi.json`](../contracts/openapi.json). Today that contract is served by the stateful HTTP mock
in [`../mock-server`](../mock-server/README.md); the Rust backend replaces it behind the same `/api/v1` boundary.

Everything shown by the mock is synthetic: GitHub/FSP data, checks, assistant answers and assessment results are
scenario fixtures, e-mail is a demo mailbox. The UI says so wherever it matters.

## Stack

Bun 1.4.2 (package manager and runtime), React 19.3, TypeScript 7.0.2, Vite 8.3, TanStack Router 1.170 (file
routes), Query 5.104, Form 1.33, openapi-fetch 0.17 with generated types, zod 4.6 (URL search validation),
@xyflow/react 12.12 (graph, lazy-loaded), Vitest 5 + Testing Library + MSW 3, Playwright 1.63 + axe, Biome 2.5.
Exact versions are pinned in `package.json` and `bun.lock`.

Install, scripts, the Vite dev server and build, the mock API, the Playwright runner and the demo stand all run on
Bun. Vitest is the one exception: its jsdom environment fails on Bun's EventTarget and MSW cannot patch Bun's
globals, so `bun run test` starts Vitest on Node (24.15 or newer, required by jsdom).

`tsconfig.json` is strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). `skipLibCheck` is on because
the @xyflow/react 12.12 declarations do not compile under `exactOptionalPropertyTypes`; project sources are checked
in full.

## Structure (Feature-Sliced Design)

| Layer | Contents |
| --- | --- |
| `src/app` | providers, router, query client with the 401 handler, route guards, file routes (`routes/`) |
| `src/pages` | one folder per screen: candidate overview, profile, sources, skills, assessments, workspace, result, invitations; employer needs, need editor, search, candidate view, shortlists, invitations, company, settings; login |
| `src/widgets` | app shell, competence graph (React Flow), shortlist panel, assessment next step |
| `src/features` | auth, profile form, consents, PDF import/export, start assessment, source connection, shortlist membership, invitation composer, invitation decision |
| `src/entities` | session, meta, profile, qualification badges, skills, sources, jobs, assessments, invitations, company, needs, anonymous candidates, shortlists |
| `src/shared` | typed API client and errors, generated contract types, labels and formatting, UI kit |

Route files are thin: URL validation, guards, loaders and the page component. `bun scripts/check-layers.mjs`
enforces downward imports, no cross-slice imports within a layer and access through each slice's `index.ts`.

Key rules the code follows: the selected grade is only a target; employer screens use only the anonymous projection
and read contacts from the separate disclosure resource; every private query key starts with role, actor and
company and the cache is cleared on logout, actor change or a 401; idempotency keys are reused for retries of the
same assessment start, submission or invitation; optional capabilities reported as disabled (publication,
self-application, chat, recurring tasks) have no controls.

## Local development

```sh
cd frontend
bun install --frozen-lockfile
bun install --cwd ../mock-server --frozen-lockfile   # once
bun run mock      # terminal 1: mock API on 127.0.0.1:4010
bun run dev       # terminal 2: http://127.0.0.1:5173
```

Vite proxies `/api` and (in development only) `/__mock__` to the mock. Sign in with any address: new addresses
create accounts of the selected role. Seeded accounts: `alexey@example.com` (candidate №024, confirmed Junior,
target Middle), `hr@sever-tech.example` (Север Тех), `hr@second-company.example` (second company for privacy
checks). In development the code field offers “Вставить код из демо-ящика”, and the header “Демо” dialog can switch
actors, reset mock scenarios (`baseline`, `qualified`, `assessment_failure`, `service_failure`, `no_fsp`,
`empty_bank`, `api_error`) and advance the mock clock. None of this exists in a production build.

## Contract types

Types come from the isolated generator in [`../contracts/codegen`](../contracts/codegen/README.md), which also
rewrites the contract's operation index:

```sh
bun run codegen         # regenerate after a contract change
bun run codegen:check   # fails if src/shared/api/generated is stale
```

Never edit `src/shared/api/generated/` by hand.

## Checks

```sh
bun run verify        # codegen check, typecheck, Biome + FSD layer check, unit tests, build, bundle check
bun run test          # Vitest + MSW component tests (on Node, see Stack)
bun run e2e           # Playwright against the real mock (starts mock and Vite if they are not running)
SCREENSHOTS=1 bun run e2e e2e/screenshots.spec.ts               # refresh docs/screenshots
FSP_PUBLIC_URL=https://188.166.88.183 bun run e2e:public          # smoke the deployed stand
```

`scripts/check-bundle.mjs` fails if built assets contain `/__mock__` controls or demo account data outside a
build made with `VITE_DEMO_STAND=1`. The e2e suite resets the shared mock between tests and uses one browser
context per actor; the public suite only uses public flows and fresh accounts.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `VITE_DEMO_STAND` | unset (implied in `vite` dev mode) | Adds demo-stand copy and the seeded account hints to a production build |
| `VITE_DEMO_EMAIL_CODE` | unset | Shown next to the code field when the server reports `delivery: mock_mailbox` |
| `VITE_API_ORIGIN` | empty (same origin) | Tests set an absolute origin because Node cannot resolve relative URLs |
| `FSP_API_TARGET` | `http://127.0.0.1:4010` (the mock) | Where `bun run dev` and `bun run preview` proxy `/api`, e.g. a backend on another port |

## Demo stand

The stand at <https://188.166.88.183> builds this app on the host and serves it with nginx; the API behind it is
still the mock. Provisioning, deployment, rollback and host operations are described in
[`../infra/README.md`](../infra/README.md).

## Known limits

- All data and outcomes come from mock scenarios; nothing here measures real qualification, matching quality or
  GitHub attribution.
- PDF import returns the mock's fixed preview; export is a real PDF of the current profile.
- The candidate's employer preview is assembled from non-identifying fields of their own profile; the contract has
  no endpoint for the candidate to read their anonymous projection.
- Protected navigations revalidate the session (one `/api/v1/session` request each) so an expired cookie is caught
  before cached private data is shown again.
