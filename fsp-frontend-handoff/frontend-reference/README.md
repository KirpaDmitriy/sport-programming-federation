# Typed frontend integration reference

This package is a small, executable reference for the future `frontend/` application. It contains a contract-generated type boundary, an `openapi-fetch` client, TanStack Query factories, typed PDF transfer helpers, and focused tests. It does not contain the ten implemented screens, a running Vite site, or production authentication.

## Run the verified reference

Use Bun 1.4.2 or newer. The tests run on the Bun runtime; the original 2026-10-05 checks ran on Node 24.19.0.

From the archive root:

```sh
bun install --cwd tools/contract-codegen --frozen-lockfile
bun run --cwd tools/contract-codegen generate
bun run --cwd tools/contract-codegen check
bun install --cwd frontend-reference --frozen-lockfile
bun run --cwd frontend-reference typecheck
bun run --cwd frontend-reference test
```

The application/compiler context is TypeScript 7.0.2. The separate code generator uses TypeScript 5.9.3 to satisfy its own peer requirement. Both packages include real `bun.lock` files and must remain isolated. See [`../docs/STACK_VERIFICATION.md`](../docs/STACK_VERIFICATION.md) for actual test results and the rejected generator probe.

## What to reuse

| Location | Purpose |
|---|---|
| `src/shared/api/generated/` | Declarations and deterministic manifest derived from OpenAPI |
| `src/shared/api/client.ts` | One transport factory with typed paths and included session credentials |
| `src/shared/api/result.ts` | Normalize required JSON/binary success responses and API errors |
| `src/entities/session/api/queries.ts` | Session query with no hidden retry or long-lived auth cache |
| `src/entities/candidate/api/queries.ts` | Candidate search key includes actor, company, and supported filters |
| `src/features/profile-documents/api/requests.ts` | Multipart PDF upload and PDF Blob download |
| `test/` | Nine tests for the transport boundary, cache separation, privacy types, and PDF transfer |

Create the client once in the app's provider/composition layer and pass it to domain query factories:

```ts
const api = createFspClient();
const options = candidateSearchQueryOptions(api, employerScope, {
  mode: 'recommended',
  needId,
  page: 1,
  pageSize: 10,
});
```

Here `employerScope` comes from the authenticated session and selected company, and `needId` comes from validated route state. The application can pass the options to `useQuery` or `queryClient.ensureQueryData`. Both consumers should share the same factory. Query keys separate caches; the backend still enforces access.

The default client base URL is `''`. Contract paths already start with `/api/v1`, so adding that prefix to the base URL would duplicate it. The app's Vite dev server should proxy `/api` to `http://127.0.0.1:4010` and `/__mock__` only during development. The production reverse proxy routes `/api/v1` to Rust. Keep frontend API behavior unchanged when switching the target; do not recover from a failed real request by reading local fixtures.

The tests inject `fetch` directly to inspect requests and errors without starting a server. They verify the transport adapter, not a complete browser journey. Use MSW for larger component tests and the actual HTTP mock for browser acceptance tests. Test browser credentials and proxy behavior through the real local HTTP path before calling the full app verified.

## PDF operations

`importProfilePdf(client, file, signal?)` accepts a browser `File` and returns the contract's `Job`. It serializes the generated `Blob` field to `FormData`. It intentionally leaves multipart content type and its boundary to the browser. The UI should give immediate feedback for the allowed PDF type and 2 MiB limit; the server validates the upload authoritatively. Poll the import job and show its labelled preview; only the separate confirm operation changes the profile.

`exportProfilePdf(client, signal?)` returns a PDF `Blob` and keeps JSON API errors on failure. The page may create an object URL for downloading it as `fsp-profile.pdf` and must revoke that URL after use. There is no DOCX export in this contract.

## Boundaries and next integration steps

The generated declarations protect API usage at compile time; they do not validate arbitrary response JSON at runtime. Mock schemas and conformance tests remain authoritative for wire validation. `requireData` is intended for endpoints with a required success body; handle `204` operations separately rather than treating an empty body as an error.

Move the patterns into the real app's FSD layers and adjust the generator's output destination once. The reference `tsconfig.json` covers this `.ts`-only package; the actual React app needs its JSX and Vite browser settings. Do not copy this limited reference package wholesale and call it the application.

Keep mutation retries explicit, reuse idempotency keys for the same logical submission, clear private caches on actor/company changes, and follow the detailed architecture and screen rules. The reference deliberately does not create unsupported sort controls, provider credentials, mock production fallbacks, or duplicate business logic.
