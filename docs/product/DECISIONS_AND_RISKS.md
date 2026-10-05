# Decisions, corrections and remaining risks

This register separates organizer requirements, team design decisions, executable mock behavior and work that awaits implementation. It prevents proposed behavior from being mistaken for an existing integration.

## Confirmed requirements

The full official PDF is included under `sources/`. It requires the reverse contact loop, email verification, questionnaire/selected-grade/assessment categorization, no forced grade downgrade, a team-defined interval for grade changes, support for no FSP history, two role cabinets, explained matching, persistent selections and salary-bearing invitations with controlled contact disclosure. The traceability document maps these to screens and implementation evidence.

The actual PDF intentionally supplies no FSP API, data schema, candidate dataset, vacancy dataset or evaluation labels. These statements supersede the earlier announcement's resource list. Keycloak compatibility is a future integration preference, not mandatory MVP authentication.

## Team decisions in this package

| Decision | Reason | Limit |
| --- | --- | --- |
| React SPA with Vite and TanStack | The product is an authenticated application with a separate Rust backend | A public SEO-oriented vacancy site may have different rendering needs later |
| FSD with only used layers | Keep domain ownership and import direction understandable | FSD is an organization pattern, not a reason to create empty abstractions |
| Same-origin `/api/v1` transport | Keep mock-to-Rust cutover at one boundary | Production reverse proxy and cookie/CSRF policy still need backend configuration |
| Real local HTTP mock | Exercise state transitions, cookies, authorization projections and contracts | The mock is disposable, in-memory and development-only |
| Generated API SDK/types | Reduce drift between transport schemas and frontend code | Generation and type checking do not prove real server behavior |
| Email challenge authentication | Meets the email-verification requirement without assuming an FSP identity provider | Real delivery, expiry, abuse controls and identity lifecycle belong to the backend |
| 90-day interval after successful grade change | A concrete configurable interpretation of the organizer's example | This is a team policy and must stay synchronized with backend eligibility |
| Company-scoped selective disclosure | Preserves the user's agreed privacy model | Existing-grant lifetime/revocation policy needs a production decision |
| No core in-app chat | Direct contact completes the required loop | Do not promise a message composer after acceptance |

## Corrections to the visual references

See [`MOCKUP_CORRECTIONS.md`](../../frontend/docs/MOCKUP_CORRECTIONS.md) for the complete register. The archive contains the selected final set, including corrections to the candidate preview, Docker observation status, grade status, shortlist bookmark and invitation contact explanation. Raster dates and incidental numbers are not authoritative fixtures. Additional mandatory flows require implementation from the text specification even where no separate PNG exists.

## Remaining integration work

| Area | What is real in this package | What remains unproven |
| --- | --- | --- |
| API | Proposed OpenAPI contract and executable mock | Compatibility with Дима's eventual Rust implementation |
| UI | Ten design references, screen rules, architecture and a client reference | A complete rendered and browser-tested frontend |
| External sources | Synthetic GitHub/FSP data and simulated jobs | Live OAuth, attribution correctness, API limits, incremental sync and source availability |
| PDF | Simulated import preview and a generated PDF of the current mock profile, with Cyrillic text | Accurate parsing of arbitrary real resumes and a production export pipeline |
| Assessments | Deterministic state transitions and scenario results | Secure code execution, equivalent task difficulty and valid qualification measurement |
| Matching | Deterministic reasons and controlled example data | Real-world ranking quality, calibration and bias evaluation |
| Models | Backend-only integration boundary | Availability, identifiers, quotas and behavior of the user-selected Grok/DeepSeek models through Bifrost |
| Privacy | Tested mock access projections and consent transitions | Production security, retention, data-subject operations and applicable personal-data compliance |
| Deployment | Local run instructions and proposed proxy boundary | User-supplied domain, VM, secrets, TLS and final deployment |

The prompt is tool-agnostic. Model names and provider routing do not belong in end-user screens or browser environment variables.

## Version evidence and reproducibility

The stack research records official documentation and registry metadata retrieved on 2026-10-05. Use exact package versions and the included lockfile/reference checks. A package having a `latest` tag does not by itself establish compatibility. The investigation explicitly checks peer ranges and performs code-generation/type checks where reported.

Do not rerun an unpinned scaffold command and assume the generated project still matches the handoff. If implementation starts later, inspect changed dependency versions, regenerate a coherent lockfile and rerun the relevant checks. Record the resulting versions rather than silently updating this report.

## Risks to verify before declaring the complete product ready

- Frontend-only hiding is insufficient for privacy. The real API must return distinct anonymous and disclosed projections and protect graph/source/export endpoints too.
- A passing mock assessment is not evidence of actual competence. The final hackathon submission needs an honest evaluation procedure and actual results.
- A recommendation based on a synthetic competition must not be advertised as a real future event or guaranteed proof of a job requirement.
- Query caches can leak data after actor or company changes unless cleared/partitioned deliberately.
- An asynchronous mutation can outlive navigation. Preserve its identifier, handle retries and reconcile final state without duplicating it.
- The mandatory presentation slides 7–11 and final submission format are separate deliverables. The original template is included unchanged.

No unresolved claim is promoted to a production guarantee by the mock's test suite. The receiving agent should report concrete remaining failures rather than promising an error-free system.
