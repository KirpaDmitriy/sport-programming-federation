# Backend

The Rust service that replaces the mock behind the same `/api/v1` paths, built as a hexagonal architecture.
[`Dockerfile`](Dockerfile) builds the production API image used by `docker compose up --build`. SQLite persists
accounts, sessions, profiles, sources, processing jobs and the matching index.

## Layout

| Crate | Package | Role |
| --- | --- | --- |
| `crates/domain` | `fsp-domain` | Domain model: entities, value objects and rules, no I/O and no framework. Holds the contract vocabulary (`Grade` with its order, `Specialization`, `Role`) |
| `crates/application` | `fsp-application` | Use cases and outbound ports for persistence, verification, GitHub, FSP and LLM analysis |
| `crates/http` | `fsp-http` | Inbound adapter on axum: routing, origin check, `X-Request-Id`, the error envelope `{ code, message, requestId, details }`, `GET /health`, `404 not_found` for unknown routes |
| `crates/storage-sqlite` | `fsp-storage-sqlite` | Persistent SQLite adapter and synthetic demo seed |
| `crates/integration-github` | `fsp-integration-github` | GitHub OAuth and bounded repository analysis |
| `crates/integration-fsp-synthetic` | `fsp-integration-fsp-synthetic` | Synthetic FSP data behind the production FSP port |
| `crates/integration-bifrost` | `fsp-integration-bifrost` | Optional Bifrost adapter for graph extraction and repository-to-competition matching |
| `crates/server` | `fsp-server` (binary `fsp-career-api`) | Composition root: configuration, wiring, graceful shutdown on SIGINT/SIGTERM |

**Dependency rule:** `domain` ← `application` ← adapters (`http`, storage, integrations) ← `server`. The domain
depends on no other crate of the project and no framework; the application depends only on the domain and owns
the port traits; adapters depend inward; only `server` knows the concrete adapters. Cargo dependencies enforce the
direction.

## Toolchain

Rust 1.99.0 (pinned in `rust-toolchain.toml`, with rustfmt and clippy), edition 2024, resolver 3. Dependencies are
the latest releases as of 2026-10-06 — axum 0.8.9, tokio 1.53.2, serde 1.0.229, serde_json 1.0.151, uuid 1.27.0,
tracing 0.1.44, tracing-subscriber 0.3.23, async-trait 0.1.92, chrono 0.4.45, rusqlite 0.37.0 (bundled SQLite),
reqwest 0.12.28 (rustls), sha2 0.10.9, tower-http 0.6.11 — declared once in the workspace `Cargo.toml` and locked in
`Cargo.lock`. `unsafe` code is forbidden and clippy warnings fail the build.

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
| `FSP_DATABASE` | `data/fsp.sqlite3` | SQLite database path (the directory is created automatically) |
| `FSP_AUTH_MODE` | `demo` | `demo` exposes the fixed verification code; e-mail delivery is not implemented, so other values cannot issue challenges |
| `FSP_DEMO_EMAIL_CODE` | `123456` | Verification code used only in demo mode |
| `FSP_SECURE_COOKIE` | unset | `1` adds `Secure` to the session cookie (set it behind HTTPS) |
| `FSP_PUBLIC_WEB_URL` | `http://127.0.0.1:5173` | Browser URL used after OAuth callbacks |
| `FSP_STATIC_DIR` | unset | Serve a built SPA from this directory and use its `index.html` as the non-API fallback |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | unset | Enable GitHub OAuth when both are non-empty; `GITHUB_CALLBACK_URL` defaults to `http://127.0.0.1:8080/api/v1/integrations/github/callback` |
| `BIFROST_CHAT_URL` | unset | Enables Bifrost analysis when non-empty; `BIFROST_API_KEY` is optional and `BIFROST_MODEL` defaults to `openai/gpt-5-mini` |

CI runs the same checks in `.github/workflows/backend.yml` on changes to `backend/`.

## Remaining contract work

| Source | What it defines |
| --- | --- |
| [`../contracts/openapi.json`](../contracts/openapi.json) | Every operation except the `x-mock-only` `/__mock__` controls, which must not exist in production; index in [`API_OPERATIONS.md`](../contracts/API_OPERATIONS.md) |
| [`../docs/product/BUSINESS_RULES.md`](../docs/product/BUSINESS_RULES.md) | Accounts and access, profile visibility, consents, sources and skill states, assessment eligibility and outcomes, needs, matching and order, anonymous projection, shortlists, invitations, vacancies and applications, short tasks and freshness, disclosure, PDF, jobs |
| [`../contracts/API_INTEGRATION.md`](../contracts/API_INTEGRATION.md) | Session cookie, origin checks, validation, error envelope, idempotency, jobs, pagination, PDF, time, metadata, the cutover checklist |
| [`../mock-server`](../mock-server/README.md) | The rules as running code (`src/domain.ts`) and as HTTP tests (`test/mock-api.test.ts`), ported to `crates/server/tests/contract.rs` |

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
