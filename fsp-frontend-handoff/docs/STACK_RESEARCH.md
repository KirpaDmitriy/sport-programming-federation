# Frontend stack research

Research date: 2026-10-05. This document separates observed releases, the selected architecture, and verification still required for the full application. Package metadata was retrieved directly from the public npm registry and is preserved in [`../sources/stack-registry.json`](../sources/stack-registry.json). The snapshot contains exact versions, engines, peers, licenses, and tarball integrity values; it is not a fabricated lockfile.

## Decision

Build the authenticated application as a **React SPA with Vite and TanStack Router, Query, Form, and Table**. Rust remains the production application backend. Develop against the real HTTP mock server in this archive. Use MSW for isolated frontend tests. Generate TypeScript path and schema declarations from `contracts/openapi.json` with an isolated `openapi-typescript` tool, then use `openapi-fetch` with those declarations against both servers.

This is a project-specific architectural choice. It is not a claim that one framework is universally best. TanStack Start adds server rendering, server functions, and server routes; these do not serve a demonstrated requirement in the two authenticated cabinets, while the Rust backend already owns application behavior. The official Start overview explicitly describes Router alone as an option when those capabilities are unnecessary. Public, indexable vacancies can receive a separate rendering decision later. [Start overview](https://tanstack.com/start/latest/docs/framework/react/overview), [Router data coordination](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading).

## Verified package snapshot

Every npm package number below was returned by its registry `latest` endpoint on the research date; the Node runtime comes from its official release page. A latest tag is a moving registry pointer, not evidence that this entire combination has already been tested as an application. Pin the selected direct versions and commit the package-manager-generated lockfile after installation.

| Package or runtime | Observed version | Use in this project |
|---|---:|---|
| Node.js | 24.21.0 LTS | Preferred toolchain runtime; official release page, not npm package `node` |
| `pnpm` | 12.9.1 | Package manager at research time; replaced by Bun 1.4.2 on 2026-10-06 |
| `react`, `react-dom` | 19.3.0 | UI runtime; keep their versions aligned |
| `@types/react`, `@types/react-dom` | 19.3.0 | Matching React declarations |
| `typescript` | 7.0.2 | Strict application type checking |
| `vite` | 8.3.2 | Development server and static build |
| `@vitejs/plugin-react` | 6.1.2 | React integration for Vite 8 |
| `@tanstack/react-router` | 1.170.41 | Routes, URL state, route boundaries |
| `@tanstack/router-plugin` | 1.168.42 | File route generation; version paired with the Router release set |
| `@tanstack/react-query` | 5.104.1 | Remote state, mutations, invalidation, polling |
| `@tanstack/react-form` | 1.33.5 | Profile, need, invitation, and assessment forms |
| `@tanstack/react-table` | 9.2.6 | Candidate and source tables |
| `openapi-typescript` | 7.13.0 | Contract-derived declarations in the isolated codegen tool |
| `openapi-fetch` | 0.17.0 | Fetch client typed by the generated OpenAPI paths |
| `zod` | 4.6.5 | Form and URL validation where useful |
| `msw` | 3.0.2 | Network interception in tests |
| `vitest` | 5.0.3 | Unit and component tests |
| `@testing-library/react` | 16.3.3 | Component behavior tests |
| `@testing-library/user-event` | 14.6.7 | Realistic component interactions |
| `jsdom` | 30.1.2 | DOM environment for component tests |
| `@playwright/test` | 1.63.0 | Browser flows, screenshots, deep links |
| `@axe-core/playwright` | 4.13.0 | Automated accessibility checks within browser tests |
| `@xyflow/react` | 12.12.0 | Interactive competence graph; load only on graph screens |
| `ajv` | 8.20.0 | Mock-server and fixture schema validation |
| `ajv-formats` | 3.0.1 | Declared JSON Schema formats in mock validation |

Package-specific primary URLs are stored alongside each package in the snapshot. Independent release references include [React versions](https://react.dev/versions), [Vite releases](https://github.com/vitejs/vite/releases), [Router releases](https://github.com/TanStack/router/releases), [Query releases](https://github.com/TanStack/query/releases), [Vitest releases](https://github.com/vitest-dev/vitest/releases), [MSW releases](https://github.com/mswjs/msw/releases/latest), and [Playwright releases](https://github.com/microsoft/playwright/releases/latest).

Node 24 is the LTS choice on the research date. The official release page labels Node 26 as Current. The initial investigation used Node 24.19.0. The final integrated package verification was repeated on Node 24.21.0. [Node release status](https://nodejs.org/en/about/previous-releases).

Do not install every optional testing or visualization dependency before it has a use. These are verified version candidates for the stated responsibilities.

## Compatibility findings that affect implementation

1. **React 19 is admitted by the selected TanStack package peers.** Router requires React and React DOM at least 18; Query admits React 18 or 19; Form admits 17, 18, or 19; Table requires at least 18. The captured metadata records the exact constraints.
2. **The selected Vite plugin targets Vite 8.** `@vitejs/plugin-react@6.1.2` declares `vite: ^8.0.0`. Its compiler-related dependencies are optional. Start with the ordinary React plugin configuration. Add a compiler transform only after testing its documented integration; do not copy a Babel-only or SWC-only setup from an older Vite template.
3. **Vitest 5 admits Vite 8 and Node 24.** MSW 3 requires Node 22.12 or newer and admits TypeScript 5.9 or newer. `jsdom@30.1.2` requires Node 24.15 or newer on the 24 branch, so an arbitrary early Node 24 patch is insufficient.
4. **TanStack Form v2 is not the selected release.** The public release feed includes `2.0.0-alpha.2`, while npm's latest tag returned 1.33.5 and the current stable documentation identifies v1. Install the stable tag, not the first item in a mixed release feed. [Form documentation](https://tanstack.com/form/latest/docs/framework), [Form release feed](https://github.com/TanStack/form/releases).
5. **Use Table v9 documentation for Table v9 code.** Do not paste a v8 tutorial and assume the installed APIs, adapters, state composition, or feature setup are unchanged. [Table documentation](https://tanstack.com/table/latest/docs).
6. **MSW 3 uses its current exports and ESM setup.** Read the version-matching HTTP and integration guides before authoring handlers. The archive's actual HTTP mock server is independent of MSW. [MSW Node integration](https://mswjs.io/docs/integrations/node/), [MSW comparison](https://mswjs.io/docs/comparison).

## Why contract generation is isolated

The application uses TypeScript 7.0.2. The selected `openapi-typescript@7.13.0` generator declares a TypeScript peer of `^5.x`, so it runs in a small separate package, `tools/contract-codegen/`, with **TypeScript 5.9.3**. This older compiler is an explicit compatibility dependency of build tooling, not the frontend compiler. The generated `.d.ts` file is consumed and checked by TypeScript 7 in `frontend/`. [Generator metadata](https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/packages/openapi-typescript/package.json), [TypeScript 5.9.3 release](https://github.com/microsoft/TypeScript/releases/tag/v5.9.3).

Use `openapi-fetch@0.17.0` with the generated `paths` type. This gives typed path parameters, query parameters, bodies, responses, and errors without carrying a generated runtime SDK in the application. Form/query modules call this client through their domain boundaries. Static declarations do not replace runtime response validation. [OpenAPI TypeScript](https://openapi-ts.dev/introduction), [openapi-fetch](https://openapi-ts.dev/openapi-fetch/).

An actual alternative probe explained why peer metadata alone is insufficient: `@hey-api/openapi-ts@0.99.0` admitted TypeScript 7 in its peer range but crashed when it attempted to read `ts.SyntaxKind.AnyKeyword`. Its generated runtime under TypeScript 6 also failed the chosen `exactOptionalPropertyTypes` setting. The selected route keeps strict frontend checking and avoids editing generated vendor code. Hey API metadata remains in the research snapshot as evidence; it is not an application dependency or a second implementation option.

`tools/contract-codegen/generate.mjs` rejects unresolved/nonlocal references, generates the declarations from the local contract, and records a deterministic source/output hash. Its `check` command regenerates in memory and fails if the committed output is stale. Each isolated package has its own genuine lockfile (`bun.lock` since 2026-10-06). Do not hoist the generator into the frontend dependency context or force its TypeScript peer to version 7.

## Version and installation rules for the implementation agent

- Reuse the checked version set at the beginning of implementation. If a newer stable release exists when work begins, inspect the release notes and peers before changing the baseline. Record the resulting versions and do not silently upgrade midway through implementation.
- Set `packageManager` to an exact package-manager version (Bun since 2026-10-06). Use one lockfile per intended workspace; do not commit lockfiles of two package managers for the same package.
- Run a real install to produce the lockfile. Never handwrite lockfile integrity values or mark a dependency tree as resolved without installation.
- Do not use `--force`, `--legacy-peer-deps`, or broad overrides to hide a conflicting peer. Change the dependency choice or isolate incompatible tooling explicitly.
- Do not pin `@types/node` to an unrelated runtime major merely because that package's latest tag moved. Resolve a current patch from the Node 24 type series.
- Keep compiler, routing, code generation, and browser-testing setup conventional. No TanStack Start server, RSC runtime, TanStack DB synchronization layer, or second API abstraction is required by this scope.

## Checks required before calling the full frontend verified

The implementation must pass a real dependency install, contract validation, deterministic code generation, strict TypeScript checking, production build, focused unit/component tests, and the browser journeys in the handoff. The browser journeys must hit the actual HTTP mock server at least once. Also verify the normal build with mocking disabled so missing endpoints cannot fall back to successful fixtures.

Automated axe results are one input to accessibility review, not a proof of full accessibility. Inspect keyboard navigation, focus recovery, labels, contrast, and the graph's list alternative manually. [Playwright accessibility guidance](https://playwright.dev/docs/accessibility-testing).
