# Stateful mock API

This package is a runnable development server for the frontend. It implements the proposed `v0.1.0` HTTP contract in `contracts/openapi.json`. It is not a Rust backend, an external-source connector, an authentication service for production, or a real assessment engine.

The server validates JSON request bodies, path/query parameters, and successful JSON responses with **Ajv 2020 and ajv-formats**. JSON Schema is not approximated by handwritten validation. Cross-field business rules, authorization, and state transitions are implemented separately.

## Start and verify

Use Node 24. Initial checks ran with Node `24.19.0`; the final integrated package verification passed on `24.21.0`. Exact logs are under `reports/` in the package root. Dependencies are pinned in `package.json` and `package-lock.json`.

```bash
cd mock-server
npm ci
npm start
```

In another terminal:

```bash
curl http://127.0.0.1:4010/health
```

Expected response:

```json
{"status":"ok","service":"fsp-mock-api","version":"0.1.0"}
```

Run the integration tests and regenerate the canonical contract:

```bash
npm test
npm run contract
```

The tests import the server factory and listen on an available loopback port. They do not require a separately running server. `tests/contract-coverage.json` records which declared operations and HTTP statuses were exercised. Operation coverage is not a claim of full branch coverage.

```js
import { createMockServer } from './mock-server/src/server.mjs';

const app = createMockServer({ port: 0, scenario: 'qualified' });
const baseUrl = await app.listen();
// Use baseUrl in HTTP tests.
await app.close();
```

Configuration:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Only a loopback host is accepted. |
| `PORT` | `4010` | HTTP port. |
| `FSP_MOCK_SCENARIO` | `baseline` | Initial fixture scenario. |
| `FSP_GRADE_CHANGE_COOLDOWN_DAYS` | `90` | Integer from 0 to 365. The API returns the resulting eligibility and dates. |
| `FSP_MOCK_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins accepted on requests that carry `Origin`. A public demo sets its exact HTTPS origin. |
| `FSP_MOCK_DEV_ROUTES` | `1` | `0` answers every `/__mock__` route with `404`. |

For browser development, proxy `/api` and `/__mock__` from Vite to `http://127.0.0.1:4010`. Requests use the browser's same-origin cookies. The API paths already include `/api/v1`; do not prepend that segment a second time. `http://localhost:5173` and `http://127.0.0.1:5173` are accepted development origins. The mock intentionally does not expose permissive CORS.

This package is for local development. Do not publish the development controls or reuse this session implementation as production authentication. A later deployment must explicitly choose its allowed origin and access boundary; removing the loopback checks is not part of the frontend handoff.

Behind a reverse proxy every request arrives from loopback, so the loopback check alone no longer protects `/__mock__`. A public demonstration stand therefore runs with `FSP_MOCK_DEV_ROUTES=0`, sets `FSP_MOCK_ALLOWED_ORIGINS` to its own origin, forwards only `/api/v1/` with a loopback `Host` header and keeps the server bound to loopback. It is still a shared in-memory demo, not production authentication.

## Seed actors and scenarios

Each browser session has one role. The cookie name is `fsp_mock_session`; the cookie is opaque, `HttpOnly`, and `SameSite=Lax`. The server owns the actor and company identity. Public API requests never accept a mock actor header, a caller-supplied company identity, or a candidate ID to select the current candidate.

| Development actor | Role | Identity |
|---|---|---|
| `candidate024` | candidate | Алексей Морозов, `alexey@example.com`, alias `Кандидат №024` |
| `candidate-new` | candidate | Blank, unverified onboarding account, `new@example.com` |
| `employer-a` | employer | Север Тех, `company-a`, `hr@sever-tech.example` |
| `employer-b` | employer | Second independent company, `company-b`, `hr@second-company.example` |

Choose an actor locally:

```bash
curl -c candidate.cookies -H 'Content-Type: application/json' \
  -d '{"actor":"candidate024"}' \
  http://127.0.0.1:4010/__mock__/session

curl -b candidate.cookies http://127.0.0.1:4010/api/v1/me/profile
```

Use separate cookie files or separate browser profiles when testing two companies. Switching actors must clear all frontend query caches that contain actor-scoped data.

| Scenario | Behavior |
|---|---|
| `baseline` | Candidate 024 has a previously confirmed Junior grade and selected Middle target. The grade change cooldown has elapsed. |
| `qualified` | Candidate 024 has confirmed Middle. Rust and PostgreSQL satisfy the sample need. A new grade change is within cooldown; a same-grade retry remains available. |
| `assessment_failure` | Submitted assessments finish with a simulated failed result. The previous grade is preserved. |
| `service_failure` | Submitted assessment jobs fail with a technical error. No negative rubric is returned and no new cooldown is applied. |
| `no_fsp` | All fixture FSP histories are disconnected. The candidate bank and assessment workflow remain usable. |
| `empty_bank` | Employer searches return an empty page; saved shortlist membership remains present with unavailable profiles. |
| `api_error` | Candidate search returns a deterministic `503`. Other operations remain available. Reset the scenario to recover. |
| `new_candidate` | Use the `candidate-new` actor to demonstrate onboarding; the fixture bank otherwise remains available. |

Reset discards all mutations, sessions, challenges, and pending jobs:

```bash
curl -H 'Content-Type: application/json' \
  -d '{"scenario":"qualified"}' \
  http://127.0.0.1:4010/__mock__/reset
```

Select an actor again after resetting. No invitations are seeded. Create an invitation through the employer workflow to populate the candidate's invitation page.

The default fixture clock is `2026-10-05T12:00:00.000Z`. Read `GET /api/v1/meta` for the current clock and scenario. The mock clock is intentionally independent of the computer's date. A countdown must use the offset from `meta.serverTime`; the server remains authoritative about eligibility and code expiry. The local-only `POST /__mock__/clock` body `{"advanceSeconds":901}` advances the fixture clock, making code expiry and cooldown tests reproducible. Refresh metadata after advancing it.

## Email registration and login

`POST /api/v1/auth/email/challenges` accepts an email and the selected role. `POST /api/v1/auth/email/verify` accepts the returned `challengeId` and a six-digit code. A successful verification sets the cookie and returns `Session`.

New emails create new fixture accounts. A new employer receives an independent, initially incomplete company. A new candidate receives an unpublished, unqualified profile. An existing account cannot change its role by supplying another role in a challenge. Candidate 024 and the two seeded employers can also sign in through this flow.

Codes are never returned by the public challenge endpoint. In this local package, read the fake mailbox with `GET /__mock__/email-codes`; the fixture code is `123456`. A code expires after 15 mock-clock minutes, is single-use, and is locked after five incorrect attempts. These are development fixtures, not a production email integration.

`GET /api/v1/session` returns the current session or `401`. `DELETE /api/v1/auth/session` invalidates the current cookie and returns `204`.

## Candidate profile and visibility

The profile separates self-reported and verified fields:

| Field | Owner and meaning |
|---|---|
| `specialization`, `selectedGrade` | Candidate's selected assessment target. |
| `verifiedSpecialization`, `verifiedGrade`, `gradeConfirmedAt` | Server-owned assessment outcome. Never writable through profile PATCH. |
| `experienceMonths` | Nullable self-reported duration. `0` means no experience; `null` means unknown. Do not infer a number from GitHub activity or fabricate it during import. |
| `experience`, `teamRole`, `softSkills` | Self-reported questionnaire information. |
| `consents.processing` | Permission for enrichment and assessment processing. |
| `consents.publication` | Permission to appear in employer search after other requirements are met. |
| `category`, `onboarding` | Server-derived eligibility and blockers. |
| `assessmentEligibility.canStartSelected` | Authority for the primary assessment action after the selected target has been saved. |

Employer visibility requires verified email, a complete questionnaire, a passed assessment, processing consent, and publication consent. A selected Senior target does not change a confirmed Junior category. The two consents are independent. Revoking processing consent prevents pending jobs from applying new results.

`assessmentEligibility.canStartUpgrade` is specifically about a grade-changing attempt. It is not a global switch for every assessment. `canStartSelected` and `selectedReason` account for the current target, active attempts, unsupported fixture scopes, downgrades, and the same-grade retry exception. Show the returned `nextEligibleAt`; do not duplicate the cooldown calculation in React.

## Automatic sources and evidence

All GitHub repositories, contributions, references, and FSP competitions in this package are synthetic. Raw links deliberately use `example.com/fixtures/...`; they are not statements about real accounts or real FSP results.

`GET /api/v1/me/sources` returns each source and a nullable `activeJobId`. Connecting a source with `POST /api/v1/me/sources/{provider}/connect` starts processing automatically and returns the source with its job ID. Poll that job and refetch sources, skills, graph, and profile after it finishes. `POST .../{sourceId}/sync` is an optional refresh; it is not a required second step after connecting.

The initial GitHub snapshot has 12 repositories: 8 processed, 3 queued, and 1 unavailable. A background job is started automatically. Its completion gives 11 processed, 0 queued, and 1 unavailable. The four displayed counts must not be drawn as four mutually exclusive parts: `found` is the total. The server returns all 12 repository rows; a screen may paginate or preview four.

The source's activity period and active days are observations. There is no worked-hours field. An external-source synchronization never grants a grade. Evidence found in a project does not prove individual authorship, a production role, or a level of expertise.

FSP is optional. The local fixture accepts `FSP-DEMO-024` and `FSP-DEMO-031` as examples with verified synthetic participation. Other IDs connect without a history. Merely connecting an FSP account does not satisfy the `fsp=verified` filter.

Skill states are `confirmed`, `evidence`, `observed`, and `insufficient`. Confirmed qualification and individual skill evidence are separate dimensions. Candidate 018 is a verified Middle while PostgreSQL is still insufficiently evidenced. Self-view evidence can include raw references. Employer projections cannot.

## Assessment and asynchronous jobs

The mock contains a deterministic Rust idempotency task family with rubric and variant metadata. `GET /api/v1/meta` reports the supported backend grade targets. It does not claim that frontend/fullstack task families have been implemented.

The sequence is:

1. Save the target in the profile and inspect `canStartSelected`.
2. Create an assessment with an `Idempotency-Key`.
3. Render the returned task and rubric; save code, explanation, and `externalAiUsed` through the answer endpoint.
4. Optionally request checks or an assistant response.
5. Submit with an `Idempotency-Key`, poll the returned job, and then refetch the assessment, profile, skills, and recommendations.

AI assistance, including external AI, is allowed throughout. The assistant response is a labelled static fixture. Checks and evaluation are simulated. Submitted code is stored as text and is never compiled or executed. The fixture outcome comes from the selected scenario, not an analysis of the submitted code. Do not present these results as a measured assessment quality or an actual model judgment.

The task's requirement text, code editor, and explanation can form three UI sections. The wire contract has one task plus a code/explanation answer, not three independently scored stages. The rubric metadata provides assessment dimensions; there is no browser-side grade computation.

Assessment states are `draft`, `in_progress`, `submitted`, `evaluating`, `passed`, `failed`, and `service_error`. Draft and in-progress attempts are editable. Submission makes the attempt immutable. Retrying a terminal failure creates a new attempt; it does not resubmit the old terminal attempt.

Successful grade changes apply the configured cooldown, 90 days by default. Failed attempts and technical failures preserve the previous grade and add no cooldown. Same-grade retries also add no grade-change cooldown. A successful assessment merges the assessed Rust/PostgreSQL evidence while preserving unrelated skills and prior provenance. A technical failure has no negative rubric result.

Jobs are real in-memory background state machines: queued immediately, running after approximately 300 ms, and terminal after approximately 1 second. Timers continue while the browser is closed. `GET /api/v1/jobs/{jobId}` only reads state. No number of polls causes progress. Poll according to `pollAfterMs`; stop on `succeeded` or `failed`. The response can include a result and, on failure, a structured error. A technical failure can have no result. Check the job status before reading a result union.

Each job belongs to one actor. Other candidates and employer sessions receive `404`. Editing an answer while an older checks job runs makes that old result fail with `stale_input`; it cannot replace results for the new answer. Reset/restart clears all in-memory jobs. This is not a durable worker queue.

## Employer needs, matching, and shortlists

The company profile contains an explicit `businessArea`, description, and contact email. Invitation creation remains blocked until the required company fields are complete.

The seeded `need-001` belongs to `company-a`; `need-b-001` belongs to `company-b`. The sample salary is 200000 to 260000 integer RUB per month before tax. This MVP contract supports positive RUB amounts, `period: "month"`, and `taxBasis: "gross"`. The frontend must not render an editable currency, period, or gross/net selector without expanding the contract. A valid-shaped request with `from > to` returns `422`; unsupported currencies fail schema validation.

Every need has role, grade, work mode, description, and skill requirements. Each requirement specifies criticality, minimum grade, and its evidence policy. Policies can accept assessment/GitHub/FSP sources and either use system-selected synthetic competitions or explicit IDs from metadata. Requirement skill IDs must be unique and at least one requirement must be mandatory. The need graph is returned by the server.

Publication is disabled: stored needs have `published: false`, and an employer can still invite a candidate directly. There is no vacancy self-application endpoint, recurring task feed, or in-app chat in this MVP. Hide or explicitly disable controls for capabilities returned as false.

`GET /api/v1/candidates` supports `mode`, `needId`, specialization, exact verified grade, one skill, FSP status, page, and page size. Recommended mode requires a company-owned need and restricts candidates to its verified specialization and grade range. A skill filter means at least observed evidence, not necessarily a verified skill. FSP filtering requires verified participation.

Sorting is fixed and server-owned. With a need, it compares category fit, mandatory matches, desired matches, verified FSP participation, and stable candidate ID. In the bank without a need, it groups by verified specialization/grade, then verified FSP participation and ID. FSP is a tie-breaker within otherwise comparable profiles; it cannot override mandatory requirements. Do not expose a nonfunctional sort dropdown.

The fixture matcher only marks a skill as meeting the requirement when a sufficient-level confirmed assessment is accepted by the requirement's policy. GitHub observations and mere FSP participation alone do not produce a pass. Other evidence policies can therefore produce a verification gap. The result includes per-requirement reasons and `algorithmVersion: "fixture-rules-v1"`; it has no unexplained percentage score.

Saved shortlist membership is a separate resource. Filtering or paging search results never edits it. Unavailable profiles remain represented in the shortlist with `available: false`. Every shortlist and need is company-scoped; cross-company IDs return `404`.

## Invitations, disclosure, and immutable terms

Creating an invitation requires a visible candidate, a company-owned need, a message, a complete company profile, and an `Idempotency-Key`. The invitation stores a snapshot of its company and need terms, including salary. Editing or deleting the underlying need does not retroactively change an existing offer's terms.

Statuses are `sent`, `viewed`, `accepted`, `declined`, and `withdrawn`. Reading a candidate invitation does not mark it viewed; use the explicit view action. Candidate acceptance and decline, and employer withdrawal, are separate authenticated actions. Repeating the same terminal action is idempotent. Attempting a conflicting terminal action returns `409`.

On acceptance, the candidate sends `disclose`, choosing `name`, `email`, and optionally `sourceLinks`. The UI initially selects name/email but requires the candidate's explicit acceptance. The grant is stored for the invitation's company. A second company receives no grant. Declining or withdrawing creates no grant.

Employer list/profile/graph responses always use the anonymous projection, even after acceptance. Contact data is returned only by `GET /api/v1/candidates/{candidateId}/disclosure`. This separation prevents a cached profile DTO from accidentally becoming public contact data. Without a grant the endpoint returns `granted: false` and an empty `fields` object. With a grant it returns only the selected fields. Grants are snapshots of the selected values at acceptance; this mock has no revocation/edit-grant workflow.

Before consent, employer DTOs contain no real candidate names, initials, handles, repository names, source URLs, SHA values, unique source quotes, or source-specific evidence references. Candidate self-view data is a different DTO. UI hiding is not the authorization boundary.

A candidate may request a gap plan for a need only after receiving that need in their own invitation. Arbitrary unpublished employer needs cannot be read by guessing `needId`. The gap plan uses the invitation's snapshotted requirement policy.

## PDF import and export

Export returns an actual `application/pdf` document generated from the current authenticated candidate profile. PDFKit embeds the included DejaVu Sans font for Russian text. The font license is shipped alongside the font. The canonical sample file, `mock-server/fixtures/profile-export.pdf`, was generated through the HTTP endpoint, parsed with Poppler, and visually checked.

Import uses `multipart/form-data` with one `file` part, MIME type `application/pdf`, and a maximum size of 2 MiB. The mock checks the signature and PDF end marker. It does not parse the content, run OCR, or claim that extracted fields came from the uploaded file. The asynchronous job returns an explicitly marked `parser: "fixture_preview"` result. Unknown duration is `null`. The candidate reviews/edits the preview and confirms it through the separate endpoint; import cannot change verified fields.

Do not reuse this lightweight file-signature check as the security validation of a future document parser. No uploaded document is executed, and the mock discards uploaded bytes after validation.

## Errors and idempotency

All JSON errors use `{ code, message, requestId, details }`; validation details contain field paths and messages. The frontend should use `code` for behavior and the Russian message for the demo's user-facing explanation. Do not build control flow by matching message text. The response also includes `X-Request-Id`.

`contracts/error-codes.json` lists the implemented HTTP and job error codes. The OpenAPI document describes success and error schemas/statuses. `tests/contract-coverage.json` records observed status coverage.

Required idempotency keys apply to assessment creation, assessment submission, and invitation creation. Keys are scoped to actor, operation, and resource path. The same key and logically identical JSON replay the original response; the same key with a different payload returns `409`. A replay is marked with `X-Idempotent-Replay: true`. Generate one key per intended action and retain it for network retries. After a replay, refetch the resource if current state matters: the saved response is the original response snapshot.

| Status | Frontend behavior |
|---|---|
| `400` | Correct a malformed request or a schema mismatch. Treat unknown fields as a contract bug. |
| `401` | Clear actor-scoped cache and return to login. |
| `403` | Explain missing role, verification, consent, or local-origin permission. |
| `404` | Resource is unavailable, including resources outside the current actor/company. |
| `409` | Refetch current state; handle cooldown, an active operation, a terminal decision, or an idempotency conflict. |
| `413` / `415` | Explain file size or media-type restrictions. |
| `422` | Display the business validation issue, such as invalid salary range or incomplete company information. |
| `429` | Start a fresh email challenge after the demo code-attempt limit. |
| `500` | Treat as an implementation/contract defect; retain request ID. |
| `503` | Render a retryable service error. In the dedicated fixture scenario, reset to recover. |

## Files and validation boundaries

`src/contract.mjs` builds the canonical OpenAPI document. `src/data.mjs` owns fixture data. `src/domain.mjs` implements state transitions and projections. `src/server.mjs` is the HTTP boundary. `src/validation.mjs` compiles genuine JSON Schema validators. `src/pdf.mjs` generates the export. The frontend reference client is generated from the emitted JSON contract, not from these implementation modules.

The test suite covers authentication, role/tenant/owner boundaries, recursive anonymous projections, company-scoped consent, failed/successful grading, cooldown policy, source counts and automatic jobs, stale input, salary rules, requirement matching, FSP filtering/ranking, shortlist persistence, idempotency, terminal decisions, multipart import, PDF bytes, reset/error states, and response conformance. All declared operations are exercised. It does not measure real resume extraction, GitHub attribution, FSP verification, model quality, or live Rust-backend behavior.

## Operation inventory

The table below is generated from the same route inventory as the OpenAPI document. `none` means a public or local development operation. `any` means any authenticated role. A response dash denotes `204`; the PDF response is binary.

| Method | Path | Operation ID | Role | Success / schema |
|---|---|---|---|---|
| GET | `/health` | `getHealth` | none | 200 / Health |
| GET | `/api/v1/meta` | `getMeta` | none | 200 / Meta |
| POST | `/api/v1/auth/email/challenges` | `createEmailChallenge` | none | 201 / EmailChallenge |
| POST | `/api/v1/auth/email/verify` | `verifyEmail` | none | 200 / Session |
| DELETE | `/api/v1/auth/session` | `logout` | none | 204 / - |
| GET | `/api/v1/session` | `getSession` | any | 200 / Session |
| GET | `/api/v1/me/profile` | `getMyProfile` | candidate | 200 / Profile |
| PATCH | `/api/v1/me/profile` | `updateMyProfile` | candidate | 200 / Profile |
| POST | `/api/v1/me/profile/imports` | `importMyProfile` | candidate | 202 / Job |
| POST | `/api/v1/me/profile/imports/{jobId}/confirm` | `confirmProfileImport` | candidate | 200 / Profile |
| GET | `/api/v1/me/profile/export` | `exportMyProfile` | candidate | 200 / PDF |
| GET | `/api/v1/me/sources` | `getMySources` | candidate | 200 / Sources |
| POST | `/api/v1/me/sources/{provider}/connect` | `connectMySource` | candidate | 200 / Source |
| POST | `/api/v1/me/sources/{sourceId}/sync` | `syncMySource` | candidate | 202 / Job |
| GET | `/api/v1/me/skills` | `getMySkills` | candidate | 200 / Skills |
| GET | `/api/v1/me/graph` | `getMyGraph` | candidate | 200 / Graph |
| GET | `/api/v1/me/gap-plan` | `getMyGapPlan` | candidate | 200 / GapPlan |
| GET | `/api/v1/me/assessments` | `listMyAssessments` | candidate | 200 / Assessments |
| POST | `/api/v1/me/assessments` | `startAssessment` | candidate | 201 / Assessment |
| GET | `/api/v1/me/assessments/{assessmentId}` | `getAssessment` | candidate | 200 / Assessment |
| PUT | `/api/v1/me/assessments/{assessmentId}/answer` | `saveAssessmentAnswer` | candidate | 200 / Assessment |
| POST | `/api/v1/me/assessments/{assessmentId}/checks` | `runAssessmentChecks` | candidate | 202 / Job |
| POST | `/api/v1/me/assessments/{assessmentId}/assistant` | `askAssessmentAssistant` | candidate | 200 / AssistantReply |
| POST | `/api/v1/me/assessments/{assessmentId}/submit` | `submitAssessment` | candidate | 202 / Job |
| GET | `/api/v1/jobs/{jobId}` | `getJob` | any | 200 / Job |
| GET | `/api/v1/me/invitations` | `listMyInvitations` | candidate | 200 / Invitations |
| GET | `/api/v1/me/invitations/{invitationId}` | `getMyInvitation` | candidate | 200 / Invitation |
| POST | `/api/v1/me/invitations/{invitationId}/view` | `viewMyInvitation` | candidate | 200 / Invitation |
| POST | `/api/v1/me/invitations/{invitationId}/accept` | `acceptMyInvitation` | candidate | 200 / Invitation |
| POST | `/api/v1/me/invitations/{invitationId}/decline` | `declineMyInvitation` | candidate | 200 / Invitation |
| GET | `/api/v1/company` | `getCompany` | employer | 200 / Company |
| PATCH | `/api/v1/company` | `updateCompany` | employer | 200 / Company |
| GET | `/api/v1/needs` | `listNeeds` | employer | 200 / Needs |
| POST | `/api/v1/needs` | `createNeed` | employer | 201 / Need |
| GET | `/api/v1/needs/{needId}` | `getNeed` | employer | 200 / Need |
| PATCH | `/api/v1/needs/{needId}` | `updateNeed` | employer | 200 / Need |
| DELETE | `/api/v1/needs/{needId}` | `deleteNeed` | employer | 204 / - |
| GET | `/api/v1/needs/{needId}/graph` | `getNeedGraph` | employer | 200 / Graph |
| GET | `/api/v1/candidates` | `searchCandidates` | employer | 200 / CandidatePage |
| GET | `/api/v1/candidates/{candidateId}` | `getCandidate` | employer | 200 / AnonymousCandidate |
| GET | `/api/v1/candidates/{candidateId}/graph` | `getCandidateGraph` | employer | 200 / Graph |
| GET | `/api/v1/candidates/{candidateId}/gap-plan` | `getCandidateGapPlan` | employer | 200 / GapPlan |
| GET | `/api/v1/candidates/{candidateId}/disclosure` | `getCandidateDisclosure` | employer | 200 / Disclosure |
| GET | `/api/v1/shortlists` | `listShortlists` | employer | 200 / Shortlists |
| POST | `/api/v1/shortlists` | `createShortlist` | employer | 201 / Shortlist |
| GET | `/api/v1/shortlists/{shortlistId}` | `getShortlist` | employer | 200 / Shortlist |
| PATCH | `/api/v1/shortlists/{shortlistId}` | `updateShortlist` | employer | 200 / Shortlist |
| DELETE | `/api/v1/shortlists/{shortlistId}` | `deleteShortlist` | employer | 204 / - |
| PUT | `/api/v1/shortlists/{shortlistId}/members/{candidateId}` | `addShortlistMember` | employer | 200 / Shortlist |
| DELETE | `/api/v1/shortlists/{shortlistId}/members/{candidateId}` | `removeShortlistMember` | employer | 200 / Shortlist |
| GET | `/api/v1/invitations` | `listInvitations` | employer | 200 / Invitations |
| POST | `/api/v1/invitations` | `createInvitation` | employer | 201 / Invitation |
| GET | `/api/v1/invitations/{invitationId}` | `getInvitation` | employer | 200 / Invitation |
| POST | `/api/v1/invitations/{invitationId}/withdraw` | `withdrawInvitation` | employer | 200 / Invitation |
| POST | `/__mock__/session` | `mockSelectSession` | none | 200 / Session |
| POST | `/__mock__/reset` | `mockReset` | none | 200 / MockReset |
| GET | `/__mock__/email-codes` | `mockEmailCodes` | none | 200 / MockEmailCodes |
| POST | `/__mock__/clock` | `mockAdvanceClock` | none | 200 / MockClock |
