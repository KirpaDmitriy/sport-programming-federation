# Backend

The Rust service that replaces the mock behind the same `/api/v1` paths, built as a hexagonal architecture. Today it
is a skeleton: the workspace, the crate boundaries, the contract's transport rules and `GET /health`; no use case
is implemented yet. Docker, nginx and Redis are the planned surroundings.

## Layout

| Crate | Package | Role |
| --- | --- | --- |
| `crates/domain` | `fsp-domain` | Domain model: entities, value objects and rules, no I/O and no framework. Holds the contract vocabulary (`Grade` with its order, `Specialization`, `Role`) |
| `crates/http` | `fsp-http` | Inbound adapter on axum: routing, origin check, `X-Request-Id`, the error envelope `{ code, message, requestId, details }`, `GET /health`, `404 not_found` for unknown routes |
| `crates/server` | `fsp-server` (binary `fsp-career-api`) | Composition root: configuration, wiring, graceful shutdown on SIGINT/SIGTERM |

The next pieces have their place in the hexagon: `crates/application` for use cases and the ports they need
(repositories, clock, mailer, source connectors, assessment runner) as traits, and outbound adapters such as
`crates/storage-*` and `crates/integrations-*` that implement those ports. The workspace includes every crate under
`crates/` automatically.

**Dependency rule:** `domain` ← `application` ← adapters (`http`, storage, integrations) ← `server`. The domain
depends on no other crate of the project and no framework; the application depends only on the domain and owns
the port traits; adapters depend inward; only `server` knows the concrete adapters. Cargo dependencies enforce the
direction.

## Toolchain

Rust 1.99.0 (pinned in `rust-toolchain.toml`, with rustfmt and clippy), edition 2024, resolver 3. Dependencies are
the latest releases as of 2026-10-06 — axum 0.8.9, tokio 1.53.2, serde 1.0.229, serde_json 1.0.151, uuid 1.27.0,
tracing 0.1.44, tracing-subscriber 0.3.23 — declared once in the workspace `Cargo.toml` and locked in `Cargo.lock`.
`unsafe` code is forbidden and clippy warnings fail the build.

## Run and check

```sh
cd backend
cargo run -p fsp-server              # http://127.0.0.1:8080, or `just backend` from the root
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked      # `just backend-check` runs all three
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8080` | Bind port |
| `FSP_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated browser origins accepted on requests with `Origin`; others get `403 origin_not_allowed` |

CI runs the same checks in `.github/workflows/backend.yml` on changes to `backend/`.

## What to implement

| Source | What it defines |
| --- | --- |
| [`../contracts/openapi.json`](../contracts/openapi.json) | Every operation except the `x-mock-only` `/__mock__` controls, which must not exist in production; index in [`API_OPERATIONS.md`](../contracts/API_OPERATIONS.md) |
| [`../docs/product/BUSINESS_RULES.md`](../docs/product/BUSINESS_RULES.md) | Accounts and access, profile visibility, consents, sources and skill states, assessment eligibility and outcomes, needs, matching and order, anonymous projection, shortlists, invitations, vacancies and applications, short tasks and freshness, disclosure, PDF, jobs |
| [`../contracts/API_INTEGRATION.md`](../contracts/API_INTEGRATION.md) | Session cookie, origin checks, validation, error envelope, idempotency, jobs, pagination, PDF, time, metadata, the cutover checklist |
| [`../mock-server`](../mock-server/README.md) | The rules as running code (`src/domain.ts`) and as 17 HTTP tests (`test/mock-api.test.ts`) ready to port |

The mock simulates what the backend has to make real: e-mail delivery, GitHub and FSP data, PDF parsing, assessment
checks and evaluation, the assistant, and production-grade sessions and security. `GET /api/v1/meta` must then report
the real `mode`, `capabilities` and `simulation` flags.

## Running the frontend against the backend

```sh
cd frontend
bun install --frozen-lockfile
FSP_API_TARGET=http://127.0.0.1:8080 bun run dev   # app on http://127.0.0.1:5173, /api proxied to the backend
```

The development-only demo controls (actor switch, mock clock, demo mailbox) call `/__mock__` and will fail
against the backend; everything else uses the contract.

## Cutover

1. Pass the [backend cutover checklist](../contracts/API_INTEGRATION.md#backend-cutover-checklist), using the mock's
   HTTP tests as the list of cases.
2. Change the contract only through [`../contracts/README.md`](../contracts/README.md).
3. Switch the stand as described in [`../infra/README.md`](../infra/README.md#switching-the-stand-to-the-backend) and
   run the stand smoke suite (`bun run e2e:public` in `frontend/`).
