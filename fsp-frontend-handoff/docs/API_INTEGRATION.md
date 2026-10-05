# API integration guide

## Contract status

`../contracts/openapi.json` is the proposed v0.1.0 wire contract. It defines paths, schemas, operation IDs, parameters, status codes and error bodies. The local HTTP mock implements it for frontend development. Compatibility with a real Rust service must be tested when that service exists.

The complete generated operation index is [API_OPERATIONS.md](API_OPERATIONS.md). The run commands and fixtures are documented in [MOCK_SERVER.md](MOCK_SERVER.md). The selected compiler/generator boundary is described in [STACK_RESEARCH.md](STACK_RESEARCH.md); use the included generation scripts rather than hand-editing types.

## Connection and session

The contract's application paths already include `/api/v1`. In the browser use the same origin and an empty API base URL. The development Vite server proxies `/api` to `http://127.0.0.1:4010`. Do not concatenate `/api/v1` twice. Proxy `/__mock__` only in local development.

Use Vite port `5173` with `strictPort: true`. The local mock accepts the documented localhost/127.0.0.1 origins on that port; silently moving Vite to 5174 would produce an origin error. Keep the development proxy configuration out of the production routing plan.

Bootstrap metadata with `getMeta` and authenticated context with `getSession`. A missing/expired session is an authentication state, not permission to select a seeded user automatically. Real application requests use the cookie session described in the contract; never add actor/company IDs as an authorization shortcut.

Create an email challenge using the email and selected role, then verify the returned challenge ID and code. The mock's code inspection endpoint is a developer convenience, not part of the production registration UI. New employers need company onboarding before sending an offer. Existing accounts cannot acquire a different role merely by changing a request field.

On logout or actor switch, cancel obsolete reads, clear cached private data and bootstrap a new authenticated context. Separate browser contexts are required when testing simultaneous candidate/employer flows.

## Screen-to-operation map

| Screen | Primary reads | Main commands | Refresh after success |
| --- | --- | --- | --- |
| 01 Overview | `getMyProfile`, `getMySkills`, `getMySources`, `listMyInvitations` | `startAssessment` | Assessment list and selected attempt |
| 02 Profile | `getMyProfile`, `getMeta` | `updateMyProfile`, `importMyProfile`, `confirmProfileImport`, `exportMyProfile` | Profile and eligibility |
| 03 Sources | `getMySources`, `getJob` | `connectMySource`, optional `syncMySource` refresh | Sources, skills, graph and profile projections affected by evidence |
| 04 Skills | `getMySkills`, `getMyGraph` | Start an eligible assessment | Assessment list; later skills/profile after result |
| 05 Assessment | `getAssessment`, `getJob` | `saveAssessmentAnswer`, `runAssessmentChecks`, `askAssessmentAssistant`, `submitAssessment` | Current attempt and relevant job |
| 06 Result | `getAssessment`, `listMyAssessments`, `getMyProfile` | Export profile or choose an eligible next target | Profile, skills, graph and history |
| 07 Need | `getCompany`, `getNeed`, `getMeta`, `getNeedGraph` where applicable | `updateCompany`, `createNeed`, `updateNeed` | Need list/detail and corresponding recommendations |
| 08 Search | `searchCandidates`, `listShortlists`, `getShortlist` | `addShortlistMember`, `removeShortlistMember`, shortlist CRUD | Affected shortlist and membership presentation |
| 09 Employer candidate | `getCandidate`, `getCandidateGraph`, `getCandidateGapPlan`, `getCandidateDisclosure` | `createInvitation` | Company invitation list and relevant invitation |
| 10 Candidate invitation | `getMyInvitation`, `listMyInvitations` | `viewMyInvitation`, `acceptMyInvitation`, `declineMyInvitation` | Candidate invitation list/detail; employer refetches its own records |

Use `needId` when requesting a candidate comparison. Without a need, matching data can be absent/null. Do not synthesize a match from the candidate's stack in the component. The candidate's own need-specific gap endpoint is limited to a need available through their invitation; it is not unrestricted access to employers' unpublished needs.

## Request and response handling

The application's typed transport lives in `frontend/src/shared/api/`. Keep one generated type source and a small error-normalization boundary. Do not introduce a second manually written `Candidate`, `Invitation` or `Need` DTO that competes with the contract.

Map API errors using `code`, `message`, `requestId` and field `details`. The implemented mock codes are listed in [error-codes.json](../contracts/error-codes.json). Preserve user input on recoverable errors. A 401 requires session recovery; a 403 means the action is not permitted; a 404 can represent an inaccessible resource; a 409 requires refetch/reconciliation; a 422 maps to validation feedback. Do not claim that every endpoint implements every possible error scenario just because a shared error schema is documented.

For assessment creation, assessment submission and invitation creation, follow the operation's required `Idempotency-Key` header. Generate one key for a logical submission and retain it while retrying that same payload. A changed payload is a new logical command. Do not create a new key on each network retry.

`revision` values on selected response DTOs are not a promise of general optimistic locking. Unless the specific mutation defines an expected revision or precondition, do not invent `If-Match` or an `expectedRevision` body. Invitation terminal-state conflicts are enforced separately. Offer terms in an invitation are a snapshot and are not silently replaced when the underlying need is edited.

## Asynchronous work

Imports, source synchronization, checks and final assessment processing return or reference a `Job`. Poll `getJob` using its `pollAfterMs`, with cancellation and bounded retry for transient transport failures. Terminal states stop polling. A failed job must remain visibly different from a failed qualification result.

Connecting a source starts automatic processing on the mock server and exposes the active job reference on the source. The browser does not need to issue a second sync command to make the initial connection useful. After navigation/refresh, inspect the source's active job reference and resume observing it. The explicit sync action is a refresh action. No repository-by-repository approval step is introduced.

The workspace contract contains one task and a code/explanation answer. Visual steps/tabs must not invent a second server stage machine. Display adaptation instructions only when supplied by the task; submit the contracted payload. Do not execute code in the browser and label it a backend check.

A service-error result remains in the attempt history. In this contract, retrying a completed attempt means starting a new eligible assessment; there is no endpoint that reopens a terminal attempt or resumes a failed job. A transport retry of an unacknowledged submission reuses its idempotency key and is a different case.

Eligibility is target-sensitive. A flag named `canStartUpgrade` must not disable every same-grade assessment. Use `assessmentEligibility.canStartSelected` for the selected specialization/grade, and read `selectedReason` and `nextEligibleAt`. Preserve the previous confirmed result while another attempt is pending or failed.

## PDF handling

Upload a `File`/`Blob` as multipart form data using the `file` field defined by the contract. Let the browser set the multipart boundary; do not manually set `Content-Type: multipart/form-data`. Poll the import job, show the parsed preview and submit explicit confirmation before updating the profile.

The mock validates the upload envelope/signature and returns a predefined preview. It does not parse arbitrary resumes. The export endpoint returns actual `application/pdf` bytes; request a Blob, download with a safe filename and revoke any temporary object URL after use. Do not decode the PDF as JSON or introduce a DOCX export.

## Privacy projections and cache keys

Owner profile/skills/source responses are distinct from employer candidate responses. Keep their types and query families separate. The employer candidate projection remains anonymous even when the company later receives a disclosure resource; combine only the authorized disclosed fields for that company in the view.

Include authenticated actor/company scope in query keys. Include the relevant need, filter values and pagination in a search key. Shortlist membership has its own persisted query state and does not depend on the current search query. Never preload another company's contact data into a generic candidate cache.

Render source text, imported text and assistant responses as untrusted content. Do not insert raw HTML. If Markdown is used, disable raw HTML or sanitize it with a narrow policy. Only render external links for an allowed protocol and an authorized field; a hidden link is still a disclosure if it is present in the response or DOM.

The synthetic source URLs under `example.com/fixtures/` are illustrative identifiers, not hosted repository pages. In the mock UI, label them as demo references and display them as text rather than creating a broken external navigation. The evidence inspector remains functional using the supplied record. Real, authorized source URLs can become links after connector integration.

## Dates and the deterministic demo clock

The mock fixtures use a fixed demo epoch. Real browser time may be hours, days or months later. Use `meta.serverTime` as the reference for mock relative-time displays, with a controlled/injected clock in tests. Do not immediately expire a newly created email challenge by comparing its mock timestamp to the host clock.

The server is authoritative for code expiry and assessment eligibility. A client countdown is informational and must not independently reject a valid verification command. Refetch metadata when the mock scenario/clock is reset. Production relative times can use a measured server offset; retain UTC on the wire and format Russian dates in the UI.

## Backend cutover checklist

Run the same request/response, authorization and browser cases against Rust. Check the actual cookie/CSRF/origin policy, error envelope, asynchronous jobs, enum/null handling, salary units, disclosure scope and idempotency behavior. Keep provider credentials, source adapters, code execution and Bifrost routing server-side.

The contract is intentionally explicit about simulation. A production service must return truthful mode/simulation metadata and actual results; it must not reuse fixture claims to appear compatible. If real integration needs additional OAuth or lifecycle endpoints, version and document that change, regenerate types and update tests together.
