# Stack and generated-client verification

Verification date: 2026-10-05. This report records commands actually run while preparing the archive. Package availability and peers were read from primary registry metadata; runtime compatibility was then checked on the included contract and reference client. The full application has not been implemented by this package.

## Environment and selected route

| Component | Observed version / setting |
|---|---|
| Runtime used for initial compatibility checks | Node `v24.19.0` |
| Final integrated verification runtime | Node `v24.21.0`; see `../reports/verification-summary.json` |
| Package manager used for both installs | pnpm `12.9.1` |
| Canonical API input | `contracts/openapi.json`, OpenAPI `3.1.0`, proposed API version `0.1.0` |
| Isolated generator | `openapi-typescript@7.13.0` |
| Isolated generator compiler | `typescript@5.9.3` |
| Frontend/reference compiler | `typescript@7.0.2` |
| Client | `openapi-fetch@0.17.0` |
| Query layer | `@tanstack/react-query@5.104.1` |
| UI peer context | `react@19.3.0`, `react-dom@19.3.0` |
| Test runner / Vite context | `vitest@5.0.3`, `vite@8.3.2` |
| Strict checks | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `skipLibCheck: false` |

Current contract and output hashes are in `frontend-reference/src/shared/api/generated/manifest.json`. That file is regenerated with the types, so this report does not duplicate a hash that could become stale after an agreed schema correction.

The final pass regenerated after the schema freeze that included selected-target grade eligibility, `Source.activeJobId`, and the development clock endpoint. Generation, the stale-output check, strict TypeScript checking, and all nine tests passed again on that contract.

## Successful checks

Commands below are shown relative to their working directory. pnpm was invoked through the exact npm bootstrap `npm exec --yes --package=pnpm@12.9.1 -- pnpm` because it was not installed globally.

| Directory | Command | Actual outcome |
|---|---|---|
| `tools/contract-codegen/` | `pnpm install` | Exit 0; genuine `pnpm-lock.yaml` produced with generator and compatible compiler |
| `frontend-reference/` | `pnpm install` | Exit 0; genuine `pnpm-lock.yaml` produced with the TS 7 frontend context |
| Both packages separately | `pnpm install --frozen-lockfile` | Exit 0; lockfile was accepted and resolution was skipped |
| `tools/contract-codegen/` | `node generate.mjs` | Exit 0; declaration and deterministic manifest written from the actual contract |
| `tools/contract-codegen/` | `node generate.mjs --check` | Exit 0; committed declarations and source/output hashes matched |
| `frontend-reference/` | `./node_modules/.bin/tsc --version` | `Version 7.0.2` |
| `frontend-reference/` | `./node_modules/.bin/tsc --noEmit` | Exit 0 under all listed strict settings |
| `frontend-reference/` | `./node_modules/.bin/vitest run` | Exit 0; 2 test files, 9 tests passed |
| Archive root | `pnpm --dir frontend-reference verify` | Exit 0; the documented combined command also passed TypeScript checking and all 9 tests |

The nine tests cover:

1. A canonical `/api/v1/session` request includes session credentials and does not duplicate the API prefix.
2. A 403 preserves the structured API error and triggers neither a successful fixture fallback nor an automatic query retry.
3. Abort cancellation reaches the actual `Request` signal.
4. Candidate cache keys differ across employer/company and search contexts.
5. Generated anonymous candidate types omit owner identity fields; the owner profile retains its email field.
6. Missing required success data and bodyless errors are handled explicitly.
7. A browser `File` becomes actual multipart form data with the browser-generated boundary and filename.
8. PDF export returns a `Blob` instead of parsing binary content as JSON.
9. Failed PDF export retains the JSON error envelope.

The privacy type assertions are compile-time checks in the real TypeScript run. They supplement, rather than replace, the mock server's response and disclosure tests.

## Rejected compatibility probes

These experiments ran in a scratch probe directory outside the deliverable. They are recorded to explain the chosen tool boundary. Their packages, generated runtime, and alternative configuration are not an application implementation option in this archive.

### Hey API 0.99.0 with TypeScript 7.0.2

The install completed because the declared peer range admitted the compiler. Running `npm exec -- openapi-ts` exited with code 1 while initializing the generator:

```text
any: ts.SyntaxKind.AnyKeyword,
                   ^
TypeError: Cannot read properties of undefined (reading 'AnyKeyword')
```

The generator accessed a compiler-API member that was not available in that installed TypeScript 7 package. This is direct runtime evidence that a broad peer range alone is insufficient to approve that combination. It is not a claim that every future Hey API release is incompatible with TypeScript 7.

### Hey API 0.99.0 with TypeScript 6.0.3

An isolated TypeScript 6 probe generated the small probe contract successfully. The subsequent `npm exec -- tsc --noEmit` exited with code 2 under the reference's strict settings. Generated runtime files reported `TS2379`/optional-property mismatches involving `serializedBody`, `allowReserved`, and request body options when `exactOptionalPropertyTypes` was enabled.

The selected approach generates declarations only with the generator's declared supported TypeScript peer, then checks their actual use under the frontend compiler. It does not edit generated vendor runtime or disable the strict checks to make an incompatible route appear successful.

## Limits of this report

This verifies the included type generation and transport/query reference. It does not claim that Router, Form, Table, React Flow, MSW, the ten full screens, browser rendering, accessibility, or the Rust backend have passed an application build or end-to-end run. Those dependencies have a documented registry/release basis, but the implementing agent must install and exercise the full chosen app set and pass the handoff's acceptance journeys.

The compatibility probes and initial installs above used Node 24.19.0. The root package verifier subsequently passed on Node 24.21.0 after the final schema extensions and type regeneration: 18 mock tests, declaration drift check, strict frontend type checking, and nine reference tests. The root execution logs retain that separate run. The exact installed frontend Node type series is `@types/node@24.19.1`.

## Primary references

- [npm registry snapshot](../sources/stack-registry.json), including the selected isolated compiler and Node type metadata.
- [OpenAPI TypeScript documentation](https://openapi-ts.dev/introduction) and [Node API transform](https://openapi-ts.dev/node).
- [openapi-fetch documentation](https://openapi-ts.dev/openapi-fetch/).
- [TypeScript 5.9.3 release](https://github.com/microsoft/TypeScript/releases/tag/v5.9.3).
- [Node release status](https://nodejs.org/en/about/previous-releases).
- [Hey API documentation](https://heyapi.dev/docs/openapi/typescript/get-started); the failure above is an observed local probe, not a statement copied from its documentation.
