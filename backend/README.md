# Backend

Not started. The service will replace the mock behind the same `/api/v1` paths; the team's plan is a modular Rust
service with a hexagonal boundary, with Docker, nginx, Redis and `just` tasks around it. Crate layout, storage and
framework are the backend owner's choice. The Python MVP in the repository root stays as it is.

## What to implement

| Source | What it defines |
| --- | --- |
| [`../contracts/openapi.json`](../contracts/openapi.json) | Every operation except the `x-mock-only` `/__mock__` controls, which must not exist in production; index in [`API_OPERATIONS.md`](../contracts/API_OPERATIONS.md) |
| [`../docs/product/BUSINESS_RULES.md`](../docs/product/BUSINESS_RULES.md) | Accounts and access, profile visibility, consents, sources and skill states, assessment eligibility and outcomes, needs, matching and order, anonymous projection, shortlists, invitations, disclosure, PDF, jobs |
| [`../contracts/API_INTEGRATION.md`](../contracts/API_INTEGRATION.md) | Session cookie, origin checks, validation, error envelope, idempotency, jobs, pagination, PDF, time, metadata, the cutover checklist |
| [`../mock-server`](../mock-server/README.md) | The rules as running code (`src/domain.mjs`) and as 17 HTTP tests (`test/mock-api.test.mjs`) ready to port |

The mock simulates what the backend has to make real: e-mail delivery, GitHub and FSP data, PDF parsing, assessment
checks and evaluation, the assistant, and production-grade sessions and security. `GET /api/v1/meta` must then report
the real `mode`, `capabilities` and `simulation` flags.

## Running the frontend against the backend

```sh
cd frontend
bun install --frozen-lockfile
FSP_API_TARGET=http://127.0.0.1:8080 bun run dev   # app on http://127.0.0.1:5173, /api proxied to the backend
```

Allow the origin `http://127.0.0.1:5173` (and `http://localhost:5173`). The development-only demo controls (actor
switch, mock clock, demo mailbox) call `/__mock__` and will fail against the backend; everything else uses the
contract.

## Cutover

1. Pass the [backend cutover checklist](../contracts/API_INTEGRATION.md#backend-cutover-checklist), using the mock's
   HTTP tests as the list of cases.
2. Change the contract only through [`../contracts/README.md`](../contracts/README.md).
3. Switch the stand as described in [`../infra/README.md`](../infra/README.md#switching-the-stand-to-the-backend) and
   run the stand smoke suite (`bun run e2e:public` in `frontend/`).
