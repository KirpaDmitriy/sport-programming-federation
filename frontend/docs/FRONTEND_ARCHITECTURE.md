# Frontend architecture

## Scope and authority

Implement the candidate and employer application under `frontend/`, using the ten supplied mockups and their textual corrections. Develop against the archive's Node HTTP mock server. The mock implements agreed wire behavior and synthetic scenarios; Rust will replace it behind the same contract.

`contracts/openapi.json` is authoritative for paths, operation IDs, DTOs, required fields, error envelopes, and wire enums. The product requirements and screen notes are authoritative for user behavior. Raster mockups communicate layout and hierarchy; their incidental text, sample dates, and icon artifacts must not override written rules. Do not infer an endpoint or a mandatory field from pixels.

The typed client lives in `frontend/src/shared/api/`. Maintain one canonical source contract.

## Runtime boundary

The application is a static React SPA built by Vite. TanStack Router owns navigation; TanStack Query owns remote state. UI actions call `openapi-fetch` through generated OpenAPI path types. The same API calls reach the HTTP mock during development and the Rust service after integration.

| Concern | Owner |
|---|---|
| Page composition, keyboard behavior, draft interaction, rendering | Frontend |
| Session authority, permissions, private employer projections | HTTP mock now; Rust later |
| Confirmation of grades, assessments, evidence aggregation, matching | HTTP mock scenarios now; Rust services later |
| External GitHub/FSP access, LLM credentials, Bifrost/provider routing | Backend only |
| API schema and operation names | `contracts/openapi.json` |
| Synthetic scenario data and reset controls | Mock server and fixtures |

The browser must not calculate an authoritative grade, infer worked hours from GitHub, disclose private fields, or label a mocked LLM result as a real evaluation. Graph interactions select and explain supplied data; the backend owns evidence and matching semantics.

## Connection modes

The contract's paths already contain `/api/v1`. Configure the browser client with `baseUrl: ''` for same-origin requests. Never add a second `/api/v1` prefix.

| Mode | Transport | Behavior |
|---|---|---|
| Local development | Vite proxies `/api` to `http://127.0.0.1:4010` | Real HTTP mock server handles application requests |
| Mock controls in development | Vite proxies `/__mock__` to the same server | Scenario setup/reset only; not an application backend capability |
| Unit/component tests | MSW intercepts selected requests in the test process | Deterministic responses and failure injection |
| Integrated application | Same-origin `/api/v1` routed to Rust | Same typed client, forms, query keys, and screen code |

Do not run browser MSW by default while verifying the real mock server. Interception could otherwise make broken HTTP routes appear healthy. Do not fall back to fixture data after a real API error. A failed request must produce the defined error state.

Mock-only headers and reset controls must be confined to the development/test adapter. Production authentication uses the backend's contract. The UI's role switch in a demo is not authorization. If using cookie sessions, use the transport configuration required by the contract; the backend remains responsible for cookie and CSRF policy.

MSW's `setupServer` intercepts requests in a Node process; it does not create the listening HTTP service requested for this handoff. [MSW Node integration](https://mswjs.io/docs/integrations/node/), [MSW comparison](https://mswjs.io/docs/comparison).

## Feature-Sliced Design

Use the import direction `app → pages → widgets → features → entities → shared`. The omitted `processes` layer is deprecated. Add slices for actual responsibilities, not to fill an architectural template. A page may contain its own unreused sections and form logic. [FSD layers](https://feature-sliced.design/docs/reference/layers).

| Location | Responsibility | Examples for this product |
|---|---|---|
| `src/app/` | Bootstrap, providers, generated route tree, route guards, global styles | Router/Query providers, role shells, app error boundary |
| `src/pages/` | One coherent screen or closely related screens | Candidate overview, profile, sources, skills, assessment, results, employer need, candidate search, employer profile view, invitation |
| `src/widgets/` | Reused or independently meaningful screen blocks | Candidate summary, evidence inspector, saved shortlist panel |
| `src/features/` | Reusable user actions | Connect source, start check, save candidate, send invitation, respond to invitation |
| `src/entities/` | Stable domain representations | Candidate, competence, evidence, assessment, employer need, invitation |
| `src/shared/api/` | Generated declarations, typed transport, generic API error handling | `generated/`, client factory, error normalization |
| `src/shared/ui/` | Product-neutral UI primitives | Button, field, dialog, badge, table frame, skeleton |
| `src/shared/lib/` | Small libraries with named responsibilities | Money formatting, dates, URL helpers |
| `src/shared/config/` | Validated nonsecret configuration | API origin, build mode |

Tests can live beside the behavior they verify. Test fixtures and MSW setup belong outside production imports, for example `frontend/test/`. Do not put a second business implementation in `shared/mocks` that production modules consume.

Expose each slice's public surface through a small `index.ts`; import other slices through that surface. Same-layer slices do not casually import each other's internals. Compose related entities in a higher layer. Use FSD's explicit cross-reference mechanism only for a real, documented entity relationship. Avoid a global barrel that re-exports the whole application. [FSD public API](https://feature-sliced.design/docs/reference/public-api).

### Routing without import cycles

Configure generated file routes inside `src/app/routes/`. Route files are thin adapters: define URL validation, guards, loaders, and the page component. Pages and features must not import the `Route` object from `app`, because that reverses the layer direction. Pass route values through typed props or a lower-layer routing abstraction when actually reused. Keep page composition below the route layer.

Route loaders may call `queryClient.ensureQueryData` with the same query-options factory used by the page. Query remains the remote-data cache; do not copy loaded data into a separate global store. [TanStack Router external data loading](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading).

## State ownership

| State | Location | Reason |
|---|---|---|
| Current route, search filters, pagination | Validated URL state | Refresh, links, and browser Back reproduce the view |
| Profile, graph, sources, needs, search results, invitations, saved shortlist | TanStack Query | Server-controlled data with explicit invalidation |
| Unsaved form input and field validation | TanStack Form | Draft changes remain separate from saved data |
| Open dialog, selected graph node, panel expansion | Local component state | Short-lived interaction state |
| Authenticated actor and current organization | Session data from API, consumed by app guards | Permission source remains the server |
| Assessment result and processing state | API response / polling query | Browser elapsed time cannot determine evaluation outcomes |

There is no initial need for Redux, a custom event bus, or an additional general-purpose global store. Add one only for an identified state-sharing problem that the categories above do not cover.

Query keys include every input that changes the response: actor, organization where applicable, resource identity, filters, and pagination. Search ordering is fixed by the server in the current contract; show a read-only ranking label rather than a sort control or unsupported query parameter. Use distinct key families and DTOs for the candidate's own profile and an employer's anonymized projection. On logout, actor change, or organization change, cancel old work and clear private cached data before rendering the new context.

Persisted shortlists are resources independent of the search result. Changing filters or switching between recommendations and the full bank must not replace the saved selection. A selection contains stable candidate IDs and server-returned display data; it is not a snapshot of the current visible rows.

## API contract integration

Generate the path and schema declarations from the local OpenAPI document in `contracts/codegen/`. Use the generated `paths` type with `openapi-fetch` in the application. Do not handwrite parallel TypeScript wire interfaces or fix generated files by hand. When a schema changes, update the source contract and regenerate.

Place domain-specific query factories beside the owning entity, feature, or page. They call contract-typed operations, normalize errors through the shared transport boundary, and expose typed data. Components receive domain-shaped props and invoke an action; they do not construct arbitrary URL strings.

Generated TypeScript declarations provide compile-time protection. They do not validate untrusted JSON at runtime. The mock server and fixtures must be checked against the source schemas with Ajv. For OpenAPI 3.1 schemas using JSON Schema 2020-12, use the matching Ajv implementation and resolve references deliberately. Validate missing references before invoking the generator. [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html), [Ajv schema versions](https://ajv.js.org/json-schema.html).

Binary schemas are generated as `Blob`. The reference import helper accepts a browser `File` and uses a typed `FormData` serializer without setting a multipart `Content-Type` header; the browser supplies its boundary. The export helper requests a `Blob` from the PDF endpoint. Both operations retain the shared JSON error envelope on failure. Imported PDF content remains a labelled preview until the user confirms it; selecting a file must not silently overwrite the profile.

Form validators serve immediate user feedback. The server still validates input and returns field-level errors in the contract's error format. Do not generate a second independent business rule from a Zod schema that can drift from OpenAPI. Map returned errors to fields and keep unsaved input after validation or network failures.

Use `meta.serverTime` to establish a server-relative clock for expiration and cooldown displays. The mock has a deterministic clock, which can differ from the browser's current time; comparing a challenge's `expiresAt` directly with wall-clock `Date.now()` can incorrectly expire a fresh challenge. Keep the clock offset explicit, inject a clock into tests, and treat countdowns as display guidance. The server's verification response decides whether a challenge is expired; do not block verification solely because the client clock says so.

Use an `AbortSignal` for obsolete reads. Handle mutations as explicit submissions with disabled duplicate actions while pending. Where the contract specifies an idempotency key, reuse the same key for retries of the same logical request. Avoid optimistic success for invitation acceptance, contact disclosure, and confirmed grade changes; wait for the authoritative response.

After mutations, invalidate the directly affected resource families. Examples include profile plus skills after an assessment result, sources plus graph after enrichment, and invitation plus the employer projection after disclosure. Do not invalidate the entire query cache after every action.

## Product invariants the frontend must preserve

- Self-selected target grade and confirmed grade are different fields. A failed upgrade does not remove the previously confirmed grade.
- A technology observed in a repository, evidence of a skill, and a passed practical check are different statuses. Missing evidence is not proof of inability.
- Connecting GitHub queues processing automatically. Follow the returned `Source.activeJobId` and poll that job; do not call the sync endpoint again immediately after connect. A later explicit refresh uses the sync operation. Users are not required to manually approve each repository or contribution.
- Source coverage distinguishes found, processed, queued, and unavailable items. Do not invent a processing percentage from a total that includes itself as a category.
- FSP membership/history is optional. Synthetic FSP data must remain visibly a demo source until a real adapter is integrated.
- AI assistance is permitted in assessments according to the agreed product rules, including external tools. The UI does not claim to detect or penalize such use.
- Employer views are anonymized before candidate consent. Never send or cache a private owner DTO and merely conceal its identity fields with CSS.
- An invitation is accepted by the candidate. Disclosure is restricted to the receiving company and selected fields. Another company must continue to receive the anonymized projection.
- An employer need can drive a named invitation without being a published vacancy. Salary amount, currency, period, and tax basis must stay visible in the relevant decision screens.

## Graph and assessment workspace

Keep graph layout and selection in a graph widget or page-local module. React Flow is the selected interactive renderer; define custom node components using the shared typography and status primitives. The renderer accepts backend-derived nodes and edges. It is not the evidence engine. Disable edge creation or destructive editing where the product does not authorize it. Provide a synchronized list/table view so the same information is usable without navigating a canvas. Give the graph container explicit dimensions and lazy-load its code. [React Flow guide](https://reactflow.dev/learn).

The assessment workspace contains task instructions, draft solution, check results, and assistant conversation. A code editor is a replaceable UI component. Draft saves, test runs, assistant responses, and final evaluation follow the API contract. Mock runs return deterministic synthetic results. Do not execute submitted code in the browser and treat it as the future production sandbox.

Poll source processing and assessment jobs only while their response state is nonterminal. Stop when finished, failed, or unavailable; resume through an explicit retry where supported. Render status text immediately and preserve readable partial data. A spinner does not justify fabricating progress counts.

## UI implementation rules

Use the delivered design tokens and screen corrections. Build reusable primitives before repeating styling across ten pages. All product-facing copy is Russian; technology names and code stay in their original form. Use CSS variables for tokens and scoped styles for components. A large external theme is unnecessary when it conflicts with the supplied layouts.

Every data-driven page needs initial loading, empty, success, partial-data, forbidden, and failure states where they apply. Keep one clear primary action and inline errors next to the field or block they affect. Dialogs trap and restore focus; action buttons have accessible names; status meaning is available in text as well as color. Respect reduced-motion preferences.

At narrow widths, collapse the side navigation, stack form and inspector panels, and retain access to the primary action. A candidate table may switch to cards or use bounded horizontal scrolling, but identity, confirmed requirements, salary, and the action must remain available. Fixed desktop mockup dimensions are not the implementation's only viewport.

## Verification and integration sequence

1. Install the selected dependencies and generate a real lockfile. Run contract validation and client generation before writing endpoint wrappers.
2. Build the app shell, routes, role boundaries, and shared UI primitives. Add one complete read-and-mutate vertical flow through the real HTTP mock.
3. Implement candidate and employer flows using the same query and form conventions. Cover failure paths while each feature is added.
4. Test product rules with unit/component tests and MSW where useful. Run browser journeys through the actual HTTP mock without interception, including refreshed deep links and filter changes.
5. Run privacy checks across owner, employer A, and employer B contexts. Confirm that response bodies and caches, not only visible labels, obey disclosure rules.
6. Build with mock controls disabled. Switch the API target to Rust when available and repeat the same contract and browser checks. Fix an actual contract mismatch at its source; do not add undocumented fallback behavior.

The full application is ready only when the documented user actions persist across navigation, errors are actionable, privacy projections are correct, generated code is current, and the browser journeys pass. A collection of static screens is not sufficient.
