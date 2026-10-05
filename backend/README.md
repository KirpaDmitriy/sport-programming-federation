# Backend

Not started. The agreed plan is a modular Rust service with a hexagonal boundary that replaces the mock behind the
same `/api/v1` paths; Docker, nginx, Redis and `just` tasks are the planned surroundings (requirement PD-11 in
[`../docs/product/REQUIREMENTS_TRACEABILITY.md`](../docs/product/REQUIREMENTS_TRACEABILITY.md)). Crate layout,
storage and framework are the backend owner's choice. The Python MVP in the repository root stays as it is.

## What to implement

- **Contract:** every operation in [`../contracts/openapi.json`](../contracts/openapi.json) except the
  `x-mock-only` `/__mock__` controls, which must not exist in production. Index:
  [`../contracts/API_OPERATIONS.md`](../contracts/API_OPERATIONS.md).
- **Product rules:** [`../docs/product/PRODUCT_RULES.md`](../docs/product/PRODUCT_RULES.md): verified e-mail
  registration, selected versus verified grade, anonymous employer projections, company-scoped disclosure after the
  candidate accepts, salary rules, assessment and simulation limits.
- **Behavior reference:** [`../mock-server`](../mock-server/README.md). `src/domain.mjs` holds the rules the
  frontend relies on (projections, consent scope, cooldown, idempotency, jobs) and `test/mock-api.test.mjs` states
  them as HTTP tests. Its data and outcomes are synthetic; real e-mail, GitHub/FSP sources, assessment execution
  and model calls are backend work.

## Transport the frontend depends on

- Same origin; nginx forwards only `/api/v1/` to the service.
- Cookie session: opaque, `HttpOnly`, `SameSite=Lax`, `Secure` behind TLS. `GET /api/v1/session` answers 401
  without a session; on any 401 the frontend clears its caches and returns to sign-in.
- Requests with a foreign `Origin` are rejected with 403 (`origin_not_allowed` in the mock). In local development
  the browser origin is `http://127.0.0.1:5173` or `http://localhost:5173`.
- Errors use `{ code, message, requestId, details[] }` plus an `X-Request-Id` header. The UI branches on `code`
  ([`../contracts/error-codes.json`](../contracts/error-codes.json)), never on message text.
- `Idempotency-Key` is required for starting and submitting an assessment and for creating an invitation. The same
  key with the same body replays the stored response with `X-Idempotent-Replay: true`; a different body is 409.
- PDF import, source sync, assessment checks and assessment submission return a job that the frontend polls via
  `GET /api/v1/jobs/{jobId}`.
- `GET /api/v1/meta` reports `mode` and `capabilities` (`realCodeExecution`, `realLlm`, `chat`,
  `vacancyPublication`, …) truthfully: the UI hides disabled features and labels simulated results from these flags.

## Running the frontend against the backend

```sh
cd frontend
bun install --frozen-lockfile
FSP_API_TARGET=http://127.0.0.1:8080 bun run dev   # app on http://127.0.0.1:5173, /api proxied to the backend
```

The development-only demo controls (actor switch, mock clock, demo mailbox) call `/__mock__` and will fail
against the backend; everything else uses the contract.

## Cutover

1. Pass the conformance list in [`../frontend/docs/ACCEPTANCE_TESTS.md`](../frontend/docs/ACCEPTANCE_TESTS.md)
   ("Contract checks for the real Rust API") and the checklist in
   [`../contracts/API_INTEGRATION.md`](../contracts/API_INTEGRATION.md). The mock's HTTP tests are a ready list of
   cases to port to the service.
2. Change the contract only through [`../contracts/README.md`](../contracts/README.md).
3. Switch the stand as described in [`../infra/README.md`](../infra/README.md) and run the public smoke suite
   (`bun run e2e:public` in `frontend/`).
