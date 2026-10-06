# Contract type generation

`generate.ts` turns the canonical [`../openapi.json`](../openapi.json) into the frontend's TypeScript declarations
and rewrites the [operation index](../API_OPERATIONS.md). It is build tooling, written in TypeScript 7 and run by
Bun, with no runtime dependencies.

## Why a local generator

The generated declarations follow the layout of openapi-typescript (`paths`, `components`, `operations`), which is
what `openapi-fetch` in the frontend expects. openapi-typescript itself (7.13.0, the latest release) builds its
output with the TypeScript 5 compiler API (`ts.factory`), which the TypeScript 7 package no longer exposes, so it
cannot run in a TypeScript 7 project. `generate.ts` prints the same declarations as text: for the current contract
its output is byte-identical to openapi-typescript's apart from the header line. It supports the JSON Schema subset
the contract uses (objects with closed properties, arrays, enums, `const`, `anyOf`/`oneOf`, local `$ref`, formats)
and fails on anything else instead of guessing.

## Commands

From the repository root:

```sh
bun install --cwd contracts/codegen --frozen-lockfile
bun run --cwd contracts/codegen generate    # write the outputs
bun run --cwd contracts/codegen check       # fail if any output is stale
bun run --cwd contracts/codegen typecheck   # tsc 7 over generate.ts
```

`bun run codegen` and `bun run codegen:check` in `frontend/` call the same scripts; `just contract` rebuilds the
contract from the mock and then runs `generate`.

## Outputs

| File | Contents |
| --- | --- |
| `../../frontend/src/shared/api/generated/schema.d.ts` | `paths`, `components`, `operations` for `openapi-fetch` |
| `../../frontend/src/shared/api/generated/manifest.json` | Contract version and SHA-256, generator, output SHA-256; no timestamp, so identical input gives identical files |
| `../API_OPERATIONS.md` | The operation index in contract order |

`type: string, format: binary` becomes the DOM `Blob` type, so the PDF import sends a browser `File` through typed
`FormData` and the export returns a `Blob` without casts. Never edit the outputs by hand; change the contract and
regenerate.
