# Contract type generation

This isolated package generates TypeScript declarations and the [operation index](../API_OPERATIONS.md) from the canonical [`../openapi.json`](../openapi.json). It is build tooling, not a backend or an application runtime dependency.

## Toolchain

Use Bun 1.4.2 or newer. The application uses TypeScript 7.0.2; this tool deliberately uses TypeScript 5.9.3 to satisfy `openapi-typescript@7.13.0`'s declared `^5.x` peer. Keep this package isolated from the application compiler. The real generated `bun.lock` is included.

From the repository root:

```sh
bun install --cwd contracts/codegen --frozen-lockfile
bun run --cwd contracts/codegen generate
bun run --cwd contracts/codegen check
```

`bun run codegen` and `bun run codegen:check` in `frontend/` call the same scripts.


## Outputs and checks

The generator writes `schema.d.ts` and `manifest.json` into the application, `../../frontend/src/shared/api/generated/`, and rewrites `../API_OPERATIONS.md`. It resolves every local JSON Pointer before invoking the generator and rejects missing or nonlocal references. The manifest records the source contract version and SHA-256, generator/compiler versions, binary representation, and output SHA-256. It deliberately contains no generation timestamp, so identical input produces identical files.

The `check` script regenerates in memory and compares the committed output without writing it. A source-only contract edit fails the hash check even if its TypeScript shape would be unchanged. This catches stale generated artifacts; it is not a substitute for the mock server's schema and behavior checks.

OpenAPI `type: string, format: binary` becomes a DOM `Blob` type through the generator's documented transform hook. The import helper can therefore submit a browser `File` through typed `FormData`, and the PDF export can return a `Blob`, without a `File`-to-`string` cast or editing generated output. See [openapi-typescript Node API](https://openapi-ts.dev/node).

The application under `../../frontend/` is the consumer of record. Keep one canonical source contract and regenerate instead of editing the generated files.
