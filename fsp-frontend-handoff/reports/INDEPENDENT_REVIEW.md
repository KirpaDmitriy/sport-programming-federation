# Independent handoff review

Review date: 2026-10-05. Review language: English for the implementing agent.

## Result and scope

No unresolved blocking defect was found in the reviewed mock API and typed-client boundary after the corrections listed below. This conclusion applies to the supplied development package and the exercised scenarios. It does not establish production security, real assessment quality, matching accuracy, or completion of the frontend.

The review read the full organizer specification, product rules, screen/API specifications, mock domain and HTTP implementation, contract definitions, generated-client reference, and execution instructions. The original specification has a cover followed by printed pages 1–8. In particular, its printed pages 1–4 require assessment-based categorization, no forced downgrade, explained ranking, optional FSP history, the reverse invitation flow and contact restrictions. Its printed pages 2 and 6 explicitly state that no FSP API/schema/dataset is supplied.

Snapshot used for the independent execution and 31 probe groups:

| Item | Value |
| --- | --- |
| Contract | `contracts/openapi.json`, proposed API `0.1.0`, OpenAPI `3.1.0` |
| Contract SHA-256 | `98f28f36115a895b0c12cfcc57ddcbbb43b49c719906be96fb047825972ea2a3` |
| HTTP operations | 58 across 47 path objects |
| Independent execution runtime | Node `v24.19.0` on Linux |
| Final domain file checked by the focused policy probe | SHA-256 `3c44a258422f5e3646e564f1f2107ef01041304a8d6ec97e4651713c71c50ba4` |

The package's overall verification report may record a later repeat with another installed Node 24 patch. The independent checks below were actually run with 24.19.0; they are not relabeled as a 24.21.0 execution.

## Final compatibility update

After those probes, three response-schema fields were widened to permit truthful production integration:

| Field | Independently executed snapshot | Final contract |
| --- | --- | --- |
| `EmailChallenge.delivery` | `mock_mailbox` | `mock_mailbox` or `email` |
| Profile-import job result `parser` | `fixture_preview` | Nonempty string, maximum 80 characters |
| `AssessmentTask.version` | `1` | Nonempty string, maximum 80 characters |

The final contract SHA-256 is `d5b7135ff6ad84b39ed446ed4c1169be675bf179d94d40f9d9d7312ce46c03ca`. Its generated authoring source and JSON artifact were compared and matched. Reverting exactly those three schema edits reproduced the earlier contract hash `98f28f36115a895b0c12cfcc57ddcbbb43b49c719906be96fb047825972ea2a3`. This verifies that the wire update added no other changes. The contract still contains 47 path objects and 58 operations. Existing fixture values remain valid; request shapes, authorization fields and disclosure resources are unchanged by this update.

Two subsequent domain refinements were also read: selected-target eligibility now reports unsupported scope or downgrade before a cooldown reason, and a graph without verified specialization uses the candidate's selected specialization for its role label. The final domain SHA-256 is `3890534d0b410da50444fcc280f5a3cc154acc8ad4c080d7392995bf4d6fa325`. These refinements are not described as byte-identical to the earlier tested domain. The final package verification records the later complete run on Node 24.21.0; the 31 independent probe groups retain their original snapshot/runtime attribution.

## Corrections verified during preparation

These were findings in the developing package. They were corrected before the final review conclusion.

| Finding and trigger | Location | Resolution and evidence |
| --- | --- | --- |
| Sequential IDs started at `need-001` and `shortlist-001`, which already existed in seed data. A create command could overwrite a seeded resource, including one owned by another company. | `mock-server/src/data.mjs`, `nextId`; need/shortlist creation handlers | ID allocation skips existing map keys. Independent HTTP creation by company B preserved company A's seeded need and shortlist; foreign reads still returned 404. |
| Registration accepted only seeded accounts and did not carry the requested role. A new candidate or employer could not complete the documented registration flow. | `contract.mjs` authentication inputs; `domain.mjs` email challenge/verification handlers | The challenge binds email and role. New verified emails create the appropriate account; role reassignment for an existing email is rejected. Both registrations and role conflict were exercised over HTTP. |
| Screen requirements called for experience duration and company business area, but those values were absent from the contract. | Profile/import/company schemas and DTO construction | `experienceMonths` and `businessArea` are contracted and serialized. Unknown imported duration remains null. The independent PDF probe confirmed current experience duration in the exported document. |
| Search ignored confirmed FSP participation when otherwise comparable candidates tied. | `domain.mjs`, `searchCandidates` | Confirmed-profile strength/FSP participates in deterministic ordering after relevant match criteria. In the qualified fixture, candidate 031 ranks ahead of equally fitting 024. This is fixture behavior, not a measured hiring-quality score. |
| Grade-change interval was hardcoded in several paths; the seeded historical result later retained a different interval from the configured profile policy. | `domain.mjs`, eligibility/start/completion/reset; seeded assessment history | The interval is configurable. A 30-day run returned the corresponding policy and next-eligible date. The final focused check confirmed that seeded result history and profile eligibility agree. |
| Email challenge expiration was not checked. | `domain.mjs`, `verifyEmail` | Expiration is enforced against the explicit mock clock. A valid code submitted after advancing the clock beyond its lifetime was rejected as `challenge_expired`. |
| Passing an assessment replaced the whole skills collection; a service error produced negative rubric values despite no evaluation. | `domain.mjs`, `completeAssessment` | Only assessed claims are merged, preserving unrelated skills/provenance. Service errors return no negative rubric/check outcomes. HTTP probes preserved Docker/Redis and verified empty rubric/check arrays for the service-error scenario. |
| The initial source connection did not expose a complete automatic enrichment path. Upgrade eligibility could also be mistaken for a prohibition on every assessment. | Source and eligibility contracts; `domain.mjs` source and assessment handlers | A connected source exposes `activeJobId` and processing runs without a manual follow-up sync. Selected-target eligibility distinguishes same-grade attempts from a blocked upgrade. The API guide documents these fields. |

The document review also reconciled positive integer RUB bounds, a fixed monthly/gross salary basis, fixed backend ranking rather than an unsupported sort control, terminal invitation conflicts rather than a nonexistent invitation revision parameter, and the single code/explanation assessment payload. The integration guide explicitly avoids claiming general optimistic locking from response-only revision fields.

## Executed checks

The following commands were run independently, using the already installed locked dependencies:

| Working directory | Command | Observed result |
| --- | --- | --- |
| `mock-server/` | `npm test` | 18 tests passed, zero failed/skipped/cancelled; approximately 10.6 seconds |
| `tools/contract-codegen/` | `node generate.mjs --check` | Exit 0; generated declarations matched the contract |
| `frontend-reference/` | `./node_modules/.bin/tsc --noEmit` | Exit 0 under the reference's strict settings |
| `frontend-reference/` | `./node_modules/.bin/vitest run` | Two files, nine tests passed |

The final `tests/contract-coverage.json` records an observed successful request for all 58 operations, including logout. This is operation-presence coverage. It is not branch coverage, exhaustive authorization coverage, or evidence that every advertised error status was triggered.

Five additional ad-hoc HTTP probe batches exercised 31 scenario groups. They used isolated `createMockServer({ port: 0 })` instances and distinct session cookies. They did not bypass request validation or mutate internal state to force successful results.

| Probe family | Confirmed behavior |
| --- | --- |
| Ownership and inputs | Missing session/incorrect role rejection; grade mass-assignment rejection; anonymous search/detail/graph responses omit the tested personal identifiers; company isolation through need detail, graph, search and gap references; creation preserves foreign seeded resources; invalid salary ranges rejected; jobs reject other actors; shortlists survive filters and mark an unpublished candidate unavailable without extra profile details. |
| Invitations and disclosure | Other candidates/companies cannot read an invitation; viewing grants nothing; reordered JSON with the same idempotency key replays the original creation; a changed payload or duplicate send conflicts; email-only acceptance exposes exactly email to the receiving company; repeated acceptance cannot broaden the grant; accepted records reject decline/withdraw; later company/need edits preserve sent terms; company B's decline produces no grant. |
| Registration and local mock boundary | New candidate and employer registrations work; an existing account cannot change roles through registration; used/invalid/expired codes are rejected; zero declared experience and no FSP history can complete the questionnaire while qualification remains unverified; foreign Origin/Host and public bind are rejected; logout invalidates its issued cookie. |
| Assessment states | A successful assessment updates the verified grade and uses a configured 30-day interval; same-grade eligibility differs from upgrade eligibility; unrelated skills survive; failed upgrade and service error preserve grade/date; technical failure carries no negative rubric; a new attempt is permitted after failure; jobs complete without polling; private attempts reject another candidate. |
| PDF, imports and consent | Exported bytes are a parseable PDF containing the current owner's edited name, experience duration and verified grade; multipart import is asynchronous and owner-scoped; fixture parsing is explicitly labeled and leaves unknown duration null; a forged grade in import confirmation is rejected without consuming a later valid confirmation; a fake PDF signature is rejected; withdrawing processing consent stops queued enrichment without a result. |

A final focused HTTP check compared the qualified scenario's seeded historical result and current profile under a 30-day policy. Their next-eligible dates matched.

One initial Host-header probe used Node Fetch, which did not send the requested Host override. It was not reported as a server defect. The countercheck used `node:http` to send the actual foreign Host and received the expected 403 response.

## Boundaries the implementing agent must retain

- The 10 PNGs are design references. The full React application, route shells, browser journeys, accessibility and visual behavior have not been implemented or verified by this review.
- Server-side projection tests do not prove that future components, caches, tooltips, analytics or downloads will respect the same privacy rule. Implement the browser checks from the acceptance plan.
- The HTTP service is local, synthetic and in memory. Development actor selection, email-code inspection and clock control are deliberately not production authentication. Keep them outside the deployed application/API.
- Assessment results and GitHub/FSP enrichment are simulated. The mock does not execute submitted code, call a model, authenticate ownership of a live source account or parse arbitrary resumes. The PDF export itself is a real document built from the current profile.
- The deterministic clock must remain distinct from the host clock in demo relative-time displays. The server remains authoritative for expiry and eligibility.
- A retry after a terminal assessment service error starts a new eligible attempt. Do not call submit repeatedly on a terminal attempt or claim that a nonexistent retry endpoint exists.
- General stale-edit protection, durable jobs, source OAuth/lifecycle operations, production session expiry, disclosure revocation and production provider metadata need backend decisions and integration tests. Do not infer them from this mock.
- Production metadata must remain truthful at cutover. The final schema allows live mode, sandboxed execution, boolean simulation flags, real email delivery, named parsers and task versions. The actual integrations remain unimplemented by this mock; new OAuth/lifecycle operations may still require agreed contract changes.
- Real matching quality, task comparability and model evaluation require independent labeled data and measured results. Passing these tests cannot establish those properties.

## Source and evidence map

- [Organizer specification](../sources/organizer-spec.pdf).
- [Product rules](../docs/PRODUCT_RULES.md) and [requirements traceability](../docs/REQUIREMENTS_TRACEABILITY.md).
- [API integration guide](../docs/API_INTEGRATION.md) and [screen specification](../docs/SCREEN_SPECIFICATION.md).
- [Canonical contract](../contracts/openapi.json).
- [Executable mock tests](../tests/mock-api.test.mjs) and [operation observations](../tests/contract-coverage.json).
- [Stack verification](../docs/STACK_VERIFICATION.md) and [frontend acceptance plan](../docs/ACCEPTANCE_TESTS.md).

This report records a bounded review with explicit execution evidence. Remaining frontend and Rust work is described as work to perform, not as a completed or production-certified system.
