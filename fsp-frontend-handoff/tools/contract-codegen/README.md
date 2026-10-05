# Contract type generation

This isolated package generates TypeScript declarations from the canonical `../../contracts/openapi.json`. It is build tooling, not a backend or an application runtime dependency.

## Toolchain

Use Node 24.19 or newer within the Node 24 LTS line and pnpm 12.9.1. The application uses TypeScript 7.0.2; this tool deliberately uses TypeScript 5.9.3 to satisfy `openapi-typescript@7.13.0`'s declared `^5.x` peer. Keep this package isolated from the application compiler. The real generated pnpm lockfile is included.

From the archive root, with pnpm 12.9.1 available:

```sh
pnpm --dir tools/contract-codegen install --frozen-lockfile
pnpm --dir tools/contract-codegen generate
pnpm --dir tools/contract-codegen check
```

If pnpm is not installed, each command can be prefixed with `npm exec --yes --package=pnpm@12.9.1 --`; for example:

```sh
npm exec --yes --package=pnpm@12.9.1 -- pnpm --dir tools/contract-codegen generate
```

## Outputs and checks

The generator writes `frontend-reference/src/shared/api/generated/schema.d.ts` and `manifest.json`. It resolves every local JSON Pointer before invoking the generator and rejects missing or nonlocal references. The manifest records the source contract version and SHA-256, generator/compiler versions, binary representation, and output SHA-256. It deliberately contains no generation timestamp, so identical input produces identical files.

The `check` script regenerates in memory and compares both committed outputs without writing them. A source-only contract edit fails the hash check even if its TypeScript shape would be unchanged. This catches stale generated artifacts; it is not a substitute for the mock server's schema and behavior checks.

OpenAPI `type: string, format: binary` becomes a DOM `Blob` type through the generator's documented transform hook. The import helper can therefore submit a browser `File` through typed `FormData`, and the PDF export can return a `Blob`, without a `File`-to-`string` cast or editing generated output. See [openapi-typescript Node API](https://openapi-ts.dev/node).

When the real app is created under `frontend/`, change the single `outputUrl` in `generate.mjs` to that app's `src/shared/api/generated/` location and update the manifest location references in documentation. Keep one generated output used by the app and one canonical source contract. Do not maintain two divergent copies of the DTOs.
