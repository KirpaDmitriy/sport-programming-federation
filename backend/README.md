# Backend

The Rust service that replaces the mock behind the same `/api/v1` paths, built as a hexagonal architecture.
[`Dockerfile`](Dockerfile) builds the production API image used by `docker compose up --build`. PostgreSQL
persists accounts, sessions, profiles, sources, processing jobs and the matching index.

## Layout

| Crate | Package | Role |
| --- | --- | --- |
| `crates/domain` | `fsp-domain` | Domain model: entities, value objects and rules, no I/O and no framework. Holds the contract vocabulary (`Grade` with its order, `Specialization`, `Role`) |
| `crates/application` | `fsp-application` | Use cases and outbound ports for persistence, verification, GitHub, FSP and LLM analysis |
| `crates/http` | `fsp-http` | Inbound adapter on axum: routing, origin check, `X-Request-Id`, the error envelope `{ code, message, requestId, details }`, `GET /health`, `404 not_found` for unknown routes |
| `crates/storage-postgres` | `fsp-storage-postgres` | PostgreSQL adapter on `sqlx`/`PgPool`: embedded migrations and the synthetic demo seed |
| `crates/integration-github` | `fsp-integration-github` | GitHub OAuth and bounded repository analysis |
| `crates/integration-fsp-synthetic` | `fsp-integration-fsp-synthetic` | Synthetic FSP data behind the production FSP port |
| `crates/integration-bifrost` | `fsp-integration-bifrost` | Optional Bifrost adapter for graph extraction and repository-to-competition matching |
| `crates/server` | `fsp-server` (binary `fsp-career-api`) | Composition root: configuration, wiring, graceful shutdown on SIGINT/SIGTERM |

**Dependency rule:** `domain` ← `application` ← adapters (`http`, storage, integrations) ← `server`. The domain
depends on no other crate of the project and no framework; the application depends only on the domain and owns
the port traits; adapters depend inward; only `server` knows the concrete adapters. Cargo dependencies enforce the
direction.

## Toolchain

Rust 1.99.0 (`rust-toolchain.toml`), edition 2024, resolver 3. Workspace `Cargo.toml` declares dependency
requirements; `Cargo.lock` records resolved versions. Do not infer installed versions from a historical
"latest" list. `unsafe` is forbidden and clippy warnings fail the build. SQLx embeds migrations;
`storage-postgres/build.rs` makes migration-only changes invalidate the build cache.

## Run and check

```sh
just db-up                           # local PostgreSQL on 127.0.0.1:5434 (docker compose service)
cd backend
cargo run -p fsp-server              # http://127.0.0.1:8080, or `just backend` from the root
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked      # `just backend-check` runs all three
```

Storage tests and the `server/tests/contract.rs` suite run against real PostgreSQL: each test creates an
isolated `fsp_test_<timestamp>_<uuid>` database through the admin URL in `FSP_TEST_DATABASE_URL` (default
`postgres://fsp:fsp@127.0.0.1:5434/postgres`, the `just db-up` service). Idle test databases are reaped on the
next run without forcibly disconnecting an active test.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8080` | Bind port |
| `FSP_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated browser origins accepted on requests with `Origin`; others get `403 origin_not_allowed` |
| `DATABASE_URL` | `postgres://fsp:fsp@127.0.0.1:5434/fsp` | PostgreSQL connection; migrations and the demo seed run on startup |
| `FSP_AUTH_MODE` | `demo` | `demo` exposes the fixed verification code; e-mail delivery is not implemented, so other values cannot issue challenges |
| `FSP_DEMO_EMAIL_CODE` | `123456` | Verification code used only in demo mode |
| `FSP_SECURE_COOKIE` | unset | `1` adds `Secure` to the session cookie (set it behind HTTPS) |
| `FSP_PUBLIC_WEB_URL` | `http://127.0.0.1:5173` | Browser URL used after OAuth callbacks |
| `FSP_STATIC_DIR` | unset | Serve a built SPA from this directory and use its `index.html` as the non-API fallback |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | unset | Enable GitHub OAuth when both are non-empty; `GITHUB_CALLBACK_URL` defaults to `http://127.0.0.1:8080/api/v1/integrations/github/callback` |
| `BIFROST_CHAT_URL` | unset | Enables Bifrost analysis when non-empty; `BIFROST_API_KEY` is optional and `BIFROST_MODEL` defaults to `openai/gpt-5-mini` |

CI runs the same checks in `.github/workflows/backend.yml` for every push and PR, so the cascade always has a Rust gate.

## Contract and implemented boundaries

| Source | What it defines |
| --- | --- |
| [`../contracts/openapi.json`](../contracts/openapi.json) | Every operation except the `x-mock-only` `/__mock__` controls, which must not exist in production; index in [`API_OPERATIONS.md`](../contracts/API_OPERATIONS.md) |
| [`../docs/product/BUSINESS_RULES.md`](../docs/product/BUSINESS_RULES.md) | Accounts and access, profile visibility, consents, sources and skill states, assessment eligibility and outcomes, needs, matching and order, anonymous projection, shortlists, invitations, vacancies and applications, short tasks and freshness, disclosure, PDF, jobs |
| [`../contracts/API_INTEGRATION.md`](../contracts/API_INTEGRATION.md) | Session cookie, origin checks, validation, error envelope, idempotency, jobs, pagination, PDF, time, metadata, the cutover checklist |
| [`../mock-server`](../mock-server/README.md) | The rules as running code (`src/domain.ts`) and as HTTP tests (`test/mock-api.test.ts`), ported to `crates/server/tests/contract.rs` |

Rust implements the 74 application operations plus `/health`; `/__mock__` controls are absent. Sessions,
roles, tenant scoping and PostgreSQL persistence are real. Email ownership verification uses a fixed demo code;
FSP, code execution/evaluation, assistant replies and PDF import remain explicit simulations. GitHub OAuth is
real when configured and checks `/user` before accepting repository evidence. Bifrost graph extraction is real
when configured; repository-to-competition matching is an adapter port without a product call path.
`GET /api/v1/meta` reports configuration, not proof of a provider's availability or assessment validity.

Five idempotent commands live in `application/src/service/commands.rs`. The key, domain effects and serialized
response share one transaction; failed work rolls back. Same-key callers serialize in PostgreSQL and replay the
stored status/body. Finished responses expire after one day; legacy unresolved claims fail closed.
Verification failures commit their attempt counter; live challenges share an email budget. Profile writes use
revision guards, assessment/source writes lock the candidate, and disclosure recomputation serializes per
candidate/company. Shortlist mutations serialize before reading their aggregate.

`sources.rs` performs bounded integration I/O before a short transaction, then atomically saves source evidence
and its job. It checks consent and source freshness again before applying sync results. Jobs finish inline in
Rust, persist in PostgreSQL, and remain scoped to their candidate. There is no background worker or durable
running-job marker. GitHub evidence never creates or upgrades a verified grade.

`graphs.rs` validates bounded node/edge sets, unique IDs, endpoints, known skills and evidence references. Labels,
IDs and skill states come from application facts. Employer projections remove evidence nodes and private free
text. Model-proposed relations are not independently validated proof of a prerequisite.

Search ranking is deterministic but still operates on full candidate lists; list projections can repeat reads.
Single-profile hot paths use indexed lookups. This is appropriate to the present demo, not a measured capacity
claim. Introduce SQL pagination/batched projections only with preserved ranking/privacy tests and workload evidence.

## Running the frontend against the backend

```sh
cd frontend
bun install --frozen-lockfile
FSP_API_TARGET=http://127.0.0.1:8080 bun run dev   # app on http://127.0.0.1:5173, /api proxied to the backend
```

The development-only demo controls (actor switch, mock clock, demo mailbox) call `/__mock__` and will fail
against the backend; everything else uses the contract.

## Deployment

1. Pass the [backend compatibility checklist](../contracts/API_INTEGRATION.md#backend-compatibility-checklist), using the mock's
   HTTP tests as the list of cases.
2. Change the contract only through [`../contracts/README.md`](../contracts/README.md).
3. Deploy through [`../infra/README.md`](../infra/README.md#commands) and
   run the stand smoke suite (`bun run e2e:public` in `frontend/`).
