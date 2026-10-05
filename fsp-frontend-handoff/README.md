# FSP frontend handoff

Implementation package for the FSP reverse-hiring platform. It includes ten selected UI mockups, the organizer's original materials, product/screen specifications, a stateful local HTTP mock, a proposed OpenAPI contract, generated TypeScript declarations, a typed API reference and verification evidence.

The complete React application is the receiving agent's deliverable. The included reference is a small integration package, not a finished UI. The Rust backend, live source connectors and real assessment/matching validation remain separate workstreams.

For Данил and Дима, start with [START_HERE_RU.md](START_HERE_RU.md). For the implementing agent, use [agent/IMPLEMENTATION_PROMPT.md](agent/IMPLEMENTATION_PROMPT.md) and [AGENTS.md](AGENTS.md).

## Quick start

Use Bun 1.4.2 or newer as package manager and runtime; every package has a `bun.lock`. The latest checked runtime and commands are recorded in `reports/verification-summary.json`. Dependency installation needs network access or a populated local package cache. Dependencies are not bundled inside the archive.

From this directory:

```sh
bun install --cwd mock-server --frozen-lockfile
bun install --cwd tools/contract-codegen --frozen-lockfile
bun install --cwd frontend-reference --frozen-lockfile
bun scripts/verify-package.mjs
```

Start the mock in a separate terminal:

```sh
bun run --cwd mock-server start
```

The package moved from npm/pnpm to Bun on 2026-10-06. The 2026-10-05 reports below keep the commands that were actually run then.

It listens locally at `http://127.0.0.1:4010`. Verify `/health` and `/api/v1/meta`. See [docs/MOCK_SERVER.md](docs/MOCK_SERVER.md) for seeded actors, scenario reset, email verification and request examples. Keep the mock local; its demo session controls are intentionally not production authentication.

Open `mockups/index.html` to inspect the ten references without a web server. The gallery and source files work offline. Optional `just` recipes mirror the explicit commands above; `just` itself is not required to run the package.

## What to read

| Path | Purpose |
| --- | --- |
| [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) | Organizer requirements, team decisions, optional scope and implementation mapping |
| [docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md) | Grade, evidence, matching, salary, invitation and privacy rules |
| [docs/SCREEN_SPECIFICATION.md](docs/SCREEN_SPECIFICATION.md) | Ten main screens plus required auxiliary views/states |
| [docs/MOCKUP_CORRECTIONS.md](docs/MOCKUP_CORRECTIONS.md) | Corrections that override incidental raster details |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Layout, components, accessibility and semantic tokens |
| [docs/FRONTEND_ARCHITECTURE.md](docs/FRONTEND_ARCHITECTURE.md) | React/TanStack/FSD organization and state ownership |
| [docs/STACK_RESEARCH.md](docs/STACK_RESEARCH.md) | Verified package versions and official sources |
| [docs/STACK_VERIFICATION.md](docs/STACK_VERIFICATION.md) | Actual compatibility checks, rejected tool combinations and selected generator route |
| [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md) | Transport, sessions, asynchronous work, uploads and backend cutover |
| [docs/API_OPERATIONS.md](docs/API_OPERATIONS.md) | Generated endpoint index |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Ordered vertical slices and granular commits |
| [docs/ACCEPTANCE_TESTS.md](docs/ACCEPTANCE_TESTS.md) | Frontend tests to implement and backend integration gates |
| [docs/DECISIONS_AND_RISKS.md](docs/DECISIONS_AND_RISKS.md) | Known limits and unproven integration/product claims |
| [docs/DEMO_SCRIPT_RU.md](docs/DEMO_SCRIPT_RU.md) | Russian demonstration sequence |

## Package map

- `mockups/`: exactly ten selected PNGs, their manifest and an offline gallery.
- `design/`: synchronized CSS/JSON tokens with a system-font baseline.
- `contracts/openapi.json`: canonical proposed API v0.1.0.
- `mock-server/`: Node HTTP mock, synthetic state, JSON Schema validators, PDF export and lockfile.
- `tests/`: executable mock integration tests.
- `tools/contract-codegen/`: isolated OpenAPI type generation toolchain and lockfile.
- `frontend-reference/`: strict TypeScript 7 client/query examples, PDF helpers, tests and lockfile.
- `sources/`: original specification/template, earlier architecture atlas and registry metadata.
- `reports/`: actual verification output and independent review.
- `agent/`: the complete implementation prompt.

Actual final checks are summarized in [reports/FINAL_VERIFICATION.md](reports/FINAL_VERIFICATION.md). The independent review is [reports/INDEPENDENT_REVIEW.md](reports/INDEPENDENT_REVIEW.md). `checksums.sha256` records the packaged file bytes; it excludes itself to avoid a circular hash.

## Updating the contract

For an intentional contract change, update the contract definition used by the mock, rebuild `contracts/openapi.json`, regenerate declarations and indexes, then run all checks:

```sh
bun run --cwd mock-server contract
bun run --cwd tools/contract-codegen generate
bun scripts/build-api-index.mjs
bun scripts/verify-package.mjs
```

The mock's contract definition is a checked authoring source; the generated OpenAPI document is the wire artifact consumed by both workstreams. Keep them synchronized. Do not independently hand-edit the generated TypeScript declarations or preserve a stale second contract.

The selected generator uses its compatible compiler in an isolated package. The frontend reference uses TypeScript 7. This split was verified by execution; see the stack verification document before simplifying it away.

## Implementation boundary

The browser displays backend-owned qualifications and match reasons. It does not assign grades, infer working hours, expose private DTOs, execute candidate code, call GitHub/FSP directly or contain model-provider keys. Mock processing and scores are synthetic. The final product needs its own real source/assessment/matching evaluation.

Contact disclosure is company-scoped and follows candidate acceptance. A salary-bearing invitation can originate from an unpublished employer need. Disabled optional capabilities must not leave nonfunctional controls in the UI.

The organizer template is included unchanged. Preserving mandatory slides 7–11, deploying the eventual product and presenting validation results remain part of the team's final hackathon submission.
