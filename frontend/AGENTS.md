# Frontend implementation rules

Rules for the React application of the FSP reverse-hiring platform. The HTTP mock in `../mock-server` is a development dependency, not the Rust backend.

## Authority

1. Follow the current user's instructions and the repository's [`../AGENTS.md`](../AGENTS.md).
2. Use [`../docs/product/sources/organizer-spec.pdf`](../docs/product/sources/organizer-spec.pdf) for organizer requirements. The earlier announcement saying that an FSP API and datasets would be supplied is superseded by the actual specification.
3. Use [`PRODUCT_RULES.md`](../docs/product/PRODUCT_RULES.md) and [`REQUIREMENTS_TRACEABILITY.md`](../docs/product/REQUIREMENTS_TRACEABILITY.md) for the agreed interpretation and explicitly marked team decisions.
4. Use [`../contracts/openapi.json`](../contracts/openapi.json) for exact request/response fields, enums, methods and status codes. It is the proposed integration contract, not evidence that the Rust backend implements it.
5. Use the [screen specification](docs/SCREEN_SPECIFICATION.md) and [correction register](docs/MOCKUP_CORRECTIONS.md) for behavior. The ten PNGs are visual references; text specifications override their incidental dates, counts, icons and unsupported controls.

## Scope and structure

- The application lives in this directory. Do not change `../backend/`, the Python MVP or other workstreams from here; a contract change follows the protocol in [`../contracts/README.md`](../contracts/README.md).
- Use TypeScript and the verified compatible dependencies in [`docs/STACK_RESEARCH.md`](docs/STACK_RESEARCH.md), pinned in `package.json` and `bun.lock`. Do not mix API examples from different major versions.
- Use FSD layers `app`, `pages`, `widgets`, `features`, `entities`, `shared` only when they hold real code. Imports flow downward; expose slice public APIs. Avoid a deprecated `processes` layer and generic dumping grounds.
- Use TanStack Router for routes/search parameters, Query for server state, Form for forms, and Table where its features are needed. Do not add a second global server-state store.
- Keep Rust as the production application backend. Browser code does not assign grades, rank candidates, infer trust or call model providers directly.

## Data and privacy invariants

- Register by verified email. A selected grade is a target; only a successful assessment establishes the category visible to employers.
- Failure to pass a higher-grade assessment never changes the existing verified grade. A provider failure is a retryable service failure, not a failed assessment.
- FSP history is optional. All supplied FSP records are explicitly synthetic. GitHub ingestion is automatic; repository technology is not itself proof of a person's skill or working hours.
- Before consent, employer DTOs contain only allowed anonymous data. Do not fetch private data and hide it with CSS. Do not leak identity through tooltips, URLs, network responses, graph labels, initials, image alt text, exports or cached queries.
- Acceptance is the candidate's action. Disclosure is limited to the invitation's company and selected fields. Decline reveals nothing.
- Clear query caches on logout or actor change. Partition company data by authenticated company and candidate self-data by authenticated identity.
- Salary is a required RUB range with explicit period and tax basis. A direct invitation need not reference a published vacancy.
- Shortlist membership is independent of the current search filters. A membership change must update every visible representation.

## Mock boundary

- Use the real local HTTP mock during development through a same-origin Vite proxy. Use MSW for focused frontend tests, not as an undocumented substitute for the HTTP mock.
- Mock controls belong under `/__mock__` and are available only in local development. Real application calls use `/api/v1`.
- Do not bundle server fixtures, fake sessions, assessment answer keys or provider secrets into production assets.
- A real API error must remain an error. Never silently fall back to mock success responses.
- The included assessment, import and enrichment behavior is a deterministic simulation. Do not describe it as live GitHub analysis, real code execution or validated AI grading.

## Implementation quality

- Russian user-facing copy; English identifiers and engineering documentation. Use semantic HTML, keyboard access, visible focus, reduced motion and accessible graph/list alternatives.
- Implement loading, empty, error, unauthorized, forbidden, conflict and retry states. Show successful mutations only after the API confirms them.
- Use generated transport types. Keep form models and view models separate when they differ from DTOs. Never hand-maintain a duplicate API type system.
- Keep comments for non-obvious decisions. Do not add explanatory comments to straightforward JSX or invent compatibility claims.
- Every visible control must work or be intentionally unavailable with a reason. Omit optional capabilities that the API reports as disabled.
- Avoid speculative abstractions, unused layers, placeholder dashboards and unrequested visual effects. Reproduce the proposed hierarchy and spacing using reusable components.

## Verification and delivery

- Follow [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) in small functional commits on the team's named branch. Integrate through `dev`; `main` is the deployment branch.
- Keep the mock suite green (`bun run --cwd ../mock-server test`) and extend the unit/component and browser acceptance tests from [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md).
- Run build and type checking with the pinned toolchain. Exercise both roles in a browser at the documented desktop sizes.
- Preserve real test output. Report failures, skipped checks and environment limitations accurately. Do not manufacture coverage percentages, matching quality or assessment accuracy.
- Deliver code, an updated runbook, a verified demo script and a concise change/test report. A static screenshot does not establish functional completion.
