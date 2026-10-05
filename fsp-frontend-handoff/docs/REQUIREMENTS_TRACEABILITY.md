# Requirements and source traceability

## Authority and scope

This handoff specifies a React frontend backed by a stateful mock API. It prepares the integration boundary for the future Rust backend. A working mock flow is not evidence that email delivery, GitHub ingestion, secure execution, model evaluation, or production authorization has been implemented.

Sources:

- **Organizer specification:** [`../sources/organizer-spec.pdf`](../sources/organizer-spec.pdf), read in full. It has nine physical pages: a cover followed by printed pages 1–8. References below use **printed page numbers**.
- **Organizer presentation:** [`../sources/organizer-presentation-template.pptx`](../sources/organizer-presentation-template.pptx). The supplied announcement requires slides 7–11 to preserve their template structure and design. This is a submission requirement, not a frontend feature.
- **Approved product decisions:** the conversation with Danil and Dima and [`../sources/system-atlas.pdf`](../sources/system-atlas.pdf). The atlas records the agreed architecture; it is not an organizer API specification.
- **Design references:** the ten final PNGs listed in [`../mockups/manifest.json`](../mockups/manifest.json). They illustrate selected states, not the full functional scope.

The actual PDF explicitly says that **no FSP API, FSP schema, candidate/vacancy dataset, or reference evaluation labels are supplied** (§2, p2; §4, p6). The earlier pasted announcement suggesting an available FSP API/mock is superseded by the actual specification. All FSP integration fields in this project are proposed, synthetic data.

The IDs below are handoff traceability IDs. They are not IDs assigned by the organizer. Exact HTTP routes, wire types, error codes, and operation IDs belong to the contract shipped in this archive. Do not infer an endpoint from a screen name.

## Required MVP behavior

| ID | Requirement | Source | Frontend coverage and acceptance evidence |
|---|---|---|---|
| OR-01 | Two role-specific personal workspaces: candidate and employer. | §2.1, p3 | Separate navigation and protected views. A candidate cannot open employer-only actions or another candidate's records. |
| OR-02 | Registration by email with address confirmation. | §2.2.4, p4 | Add registration, pending verification, successful verification, expired/invalid link, resend, sign-in, and session-expired states. A demo account selector does not replace this flow. |
| OR-03 | Candidate profile/resume: manual form or PDF auto-extraction, covering name, contacts, stack, grade, roles, experience, and soft skills. | §2.1, p3 | Screen 02 plus PDF import states. Imported grade remains a claim. Unknown extracted fields remain empty. Candidate can correct extracted fields. |
| OR-04 | Automatically generate a standardized PDF profile. | §2.1, p3 | Screens 01 and 06 expose an export action with pending, ready, and failed states. The resulting document must match the selected candidate and current profile version. |
| OR-05 | Mandatory onboarding questionnaire covering industry and specialization. | §2, p1; §2.1, p3 | Add onboarding questionnaire before the first assessment. A prefilled demo profile is not a substitute for demonstrating it. |
| OR-06 | Candidate selects the grade to test. | §2, p1 | Screen 02 and assessment setup show selected grade separately from verified grade. Changing a select field does not change the employer-visible category. |
| OR-07 | Implement a testing mechanism with comparable assessment difficulty and resistance to task/answer circulation. | §2, p1–2 | Screens 05–06 plus setup/history demonstrate task variants, a shared rubric, checks, explanation, and result handling. The frontend consumes assessment decisions from the API. |
| OR-08 | Employer-visible category is based on questionnaire and passed assessment; category combines specialization and grade. | §2, p1; search requirements, p4 | Screens 01, 06, 08, 09. No verified category is minted from GitHub activity, PDF parsing, an LLM answer, or self-description alone. |
| OR-09 | Do not force a lower grade after a failed assessment. Candidate may voluntarily attempt a lower grade; successful candidates may attempt a higher one. | §2, p2 | First failed assessment leaves the profile unverified. Failed upgrade preserves the existing verified category. Lower/higher options are explicit user choices. |
| OR-10 | Grade changes have a time restriction; the team chooses the interval. | §2, p2; §2.1, p3 | Assessment setup/history show eligibility and next eligible date from the API. Never hardcode the example “three months” as an organizer-mandated value. |
| OR-11 | Show current industry, specialization, grade, and questionnaire/assessment history. | §2.1, p3 | Screens 01, 02, 06 plus history/detail views. Preserve earlier confirmed results after an unsuccessful upgrade or infrastructure error. |
| OR-12 | Candidate profile can link an FSP participant ID. Absence of FSP history must work correctly. | §2, p2; §2.1, p3 | Screen 03 and settings. FSP link is optional, an empty history is valid, and a lookup failure is distinct from an empty result. |
| OR-13 | Employer company profile contains description, business area, and contact information. | §2.1, p3 | Add company create/edit view. Invitation preview must contain these relevant details before it is sent. |
| OR-14 | Employer describes the hiring need: team/work, stack, specialization, grade. | §2.1, p3 | Screen 07. Store a need independently from a published vacancy. |
| OR-15 | Recommend categories and concrete candidates, with an explanation of why they were selected. | §2.1, p3; search requirements, p4 | Screen 08 shows category context and reasons; screen 09 gives requirement-level grounds and gaps. |
| OR-16 | Employer can search the complete accessible candidate bank, with filters for specialization, grade, category, stack, and confirmed FSP achievements. | §2.1, p3 | Screen 08 has both recommendations and full-bank modes. The full bank respects candidate publication choices and verified category rules. |
| OR-17 | Rank within a category by strength of confirmed profile, assessment results, and confirmed FSP achievements; rank search by need fit with concise explanation. | §2, p1; search requirements, p4 | Render API ranking/reasons. A confirmed FSP achievement may improve a ranking; absence is not a disqualification. Unknown FSP connection state is not a confirmed achievement. |
| OR-18 | Changing filters or refining a query must not lose the previously obtained shortlist. | Search requirements, p4 | Screen 08 keeps saved shortlist membership outside transient filters. Refresh and role-appropriate navigation preserve it. |
| OR-19 | Employer can invite a specific candidate with an offer, without publishing a vacancy. | §2, p2; §2.1, p3 | Screens 07, 09, 10 and invitation composer. The demo must complete this flow with vacancy publication off. |
| OR-20 | Invitation and vacancy contain a mandatory salary range “from–to” in RUB. | §2.2.1, p4 | Screens 07, 09, 10. Both bounds are required. This handoff additionally chooses positive whole-ruble bounds, a monthly period, and gross pay. Reject reversed, zero, negative, fractional, non-finite, and malformed input. |
| OR-21 | Invitation contains offer description, salary, company name, and a way to contact the employer. Candidate sees conditions before communication. | §2.2.1–2, p4 | Screen 10 shows the employer's contact before candidate acceptance. Do not hide both parties' contact information behind acceptance. |
| OR-22 | Candidate can accept or reject an invitation; both sides see current interaction status. | §2.1, p3; §2.2.3, p4 | Screen 10 plus candidate/employer invitation lists. Read, accept, reject, conflict, and refreshed status are reproducible mock flows. |
| OR-23 | Employer cannot access candidate contact details before acceptance or a candidate-initiated application. | §2.1, p4; §2.2.2, p4 | API omits unavailable fields. Search, profile, graphs, exports, previews, caches, and error payloads respect the same rule. CSS hiding is insufficient. |
| OR-24 | Candidate can see only their own invitations and applications; other candidates' records are unavailable. | §2.1, p3 | Mock API rejects cross-candidate access even if a request ID is changed manually. Route guards are supplementary. |
| OR-25 | Privacy settings, consent for processing/publication, and role-based data access. | §2.1, p3; §3.5, p6 | Screen 02 and settings separate processing consent, discoverability/publication, and company-specific contact disclosure. Do not silently combine these actions. |
| OR-26 | End-to-end demonstration: registration → questionnaire → assessment → category → employer search → named invitation/contact. | §3.3, p5 | Provide a resettable demo script that starts from an unverified candidate, not only the upgraded profile shown in screen 06. |

## Agreed product decisions

These choices extend or concretize the organizer's brief. They must not be described as externally supplied facts or industry-certified measures.

| ID | Decision | Consequence for the frontend and mock |
|---|---|---|
| PD-01 | GitHub is the first external source; enrichment is automatic after account linking. | No manual repository selection/approval is required to start or finish enrichment. Show progress and supported retry actions. The core mock has no disconnect/report operation; those controls remain hidden until supported. |
| PD-02 | Public source observations, AI interpretations, and assessment results are separate evidence types. | Every skill detail distinguishes what was found, what was inferred, and what was checked. A repository technology does not automatically become a verified personal skill. |
| PD-03 | Competence and requirement graphs drive explainable matching. | Screen 04 presents skills and evidence; screens 07–09 present required level, criticality, accepted evidence, match result, and remaining gap. A list/table must remain available as an accessible equivalent. |
| PD-04 | Employer can define accepted evidence by requirement and use a default policy. | Support an evidence-policy editor/detail panel. Source/event choices must come from supplied catalogs. Never invent a real competition or claim FSP endorsement. |
| PD-05 | Gap analysis suggests how to obtain missing evidence. | Recommend an available assessment or an explicitly synthetic demonstration event. Do not claim a real competition schedule or guaranteed qualification outcome without source data. |
| PD-06 | AI assistance is allowed throughout assessment, including external tools, coding, checking, and explanation. | Keep the visible allowance from screen 05. No hidden ban on AI during the explanation/adaptation stage. The mock assistant is labeled as simulated when no model is connected. |
| PD-07 | Common task-family rubric with controlled variants and an adaptation/explanation stage. | Show the attempt's task/rubric/version and progress consistently. The initial implementation simulates scoring through API fixtures; it must not claim real model or code evaluation. |
| PD-08 | Employers see pseudonyms and generalized evidence until candidate consent. | Hide name, personal photo, real initials, email, phone, GitHub handle/URL, repository names/URLs, SHAs, and identifying code/quotes in employer projections. This is stronger than the organizer's contact-only minimum. |
| PD-09 | Disclosure is scoped to the accepting invitation and company. | Candidate sees the recipient and selected fields. Acceptance by one company does not unlock another company's profile view. Accepted need/offer terms remain in history. |
| PD-10 | GitHub activity is an observation, not worked hours or a calibrated skill probability. | Use found/processed/queued/unavailable counts and observation periods. Do not infer hours, grade, or a confidence percentage from commit volume. |
| PD-11 | Rust backend, React/TanStack frontend, FSD organization, monorepo modules, Docker/Nginx/Redis, just tasks. | Follow the technical plan and package versions shipped elsewhere in the handoff. UI does not call databases, Bifrost, GitHub, or model vendors directly. |
| PD-12 | Models are accessed through the future server-side Bifrost boundary. | Grok/DeepSeek identifiers from the conversation are planned configuration, not proof of availability. Frontend depends on assessment/source APIs, not provider-specific SDKs or credentials. |
| PD-13 | Team works on personal branches, integrates into dev, main is intended for deployment. | Agent makes cohesive commits and supplies launch/test instructions. No deployment or real backend availability is implied by the mock implementation. |

## Optional and later scope

| Feature | Organizer position | Treatment in this handoff |
|---|---|---|
| Candidate vacancy browsing, self-application, application history | Desirable, not required for MVP (§2.1, p3) | Optional extension. Hide navigation/actions until implemented end to end with the same salary and disclosure rules. |
| Employer vacancy publication, editing, incoming applications | Desirable, not required for MVP (§2.1, p4) | The toggle in screen 07 is a visual option, not permission to ship a dead control. Named invitation is the primary flow. |
| Recurring short employer tasks | Desirable, not required for MVP (§2.1, p3) | Optional extension. The general description on p2 must be read together with this explicit MVP qualification. |
| Anti-fraud employer checks and ATS integration | Concept/architecture after MVP; a bonus (§2, p2–3) | Document extension boundaries. Do not invent verified-company badges, mandatory moderation, or an implemented ATS integration. |
| Keycloak/FSP ID authentication compatibility | Future recommendation, not mandatory (§2, p2; §3.5, p6) | Keep identity integration replaceable; email confirmation is still required. |
| Mobile/tablet adaptation | Optional for organizer MVP (§3.5, p6) | This handoff sets a practical responsive implementation target. Complete the desktop hiring flow first. |
| Candidate/employer in-app chat | Not required in the provided specification | Outside the core handoff. The final screen 10 describes direct contact after acceptance; do not add a chat promise without a contracted, tested implementation. |
| Need import from PDF, arbitrary file editing, drag sorting | Not specified as mandatory | Implement only when the contract and supporting states exist. Core need form and working assessment submission take priority. |

## Delivery requirements beyond the frontend

| ID | Required or recommended deliverable | Source and interpretation |
|---|---|---|
| DL-01 | Readable source code and repository link | §3.5, p5; §5, p6–7. Source must be available for review, unobfuscated. The brief does not force a public GitHub repository or a particular project license. |
| DL-02 | Functional/component architecture and assessment/matching rationale | §3.4, p5. Include category rules, task leakage resistance, and reasons for ranking. |
| DL-03 | Own validation procedure and measured results | §2, p2; §3.4, p5. Synthetic fixtures and UI tests alone are not proof of actual assessment or hiring quality. Report what was measured and on which data. |
| DL-04 | Proposed FSP registry integration | §3.4, p5. Clearly label the schema/adapter as a team proposal with synthetic data. |
| DL-05 | API documentation and library/component versions | §3.4, p5; §3.5, p6. This project uses OpenAPI as the shared contract; all implemented operations need request/response/error coverage. |
| DL-06 | Reproducible build, local start, and deployment instructions | §3.4–3.5, p5. Docker is desirable; reproducible operation is essential. |
| DL-07 | Presentation in PPTX/PDF, source link, companion documentation in DOC/PDF | §3.3, p5; §5.2, p6–7. Markdown development documentation needs an appropriate submission export. Preserve required template slides. |
| DL-08 | Deployable prototype accessible for review | §3.3, p5; §5.2, p7. Strongly preferred. If deployment is unavailable, provide a demonstration video and clear local launch instructions. VM/domain come from the team. |

The original specification also names security, safe credential storage, and protection of personal information (§3.5, p6). The mock implements and tests the **shape of authorization and disclosure**. A real deployment still requires backend enforcement, actual identity/session security, and the applicable operational/legal work. Do not mark these production obligations complete from browser-only tests.

## Evaluation priorities

| Criterion | Weight | Practical priority |
|---|---:|---|
| Reverse hiring mechanism and explanation | 35% | Complete need → category/candidate search → invitation → candidate decision. |
| Assessment, validation, categorization | 25% | Demonstrate controlled variants, stable rules, no forced downgrade, and an honest validation method. |
| Interface usability | 10% | Both role journeys should be understandable without narration. |
| Technical implementation | 7% | Coherent state/API boundary, reproducible launch, maintainable code. |
| Required scope and documentation | 6% | Cover onboarding, no-FSP history, API, architecture, and run instructions. |
| Optional functionality | 7% | Add only after the primary flow and required states work. |
| Presentation and pitch | 10% | Explain evidence, assessment, matching, and actual implementation limits clearly. |

Source: §6, printed p7–8. Weights total 100%. They are supplied evaluation weights, not a forecast of competition results.

## Release evidence checklist

- [ ] A new candidate verifies email, completes the questionnaire, chooses a grade, and receives an API-backed mock assessment outcome.
- [ ] Initial failure, failed upgrade, successful upgrade, and temporary evaluation failure have distinct results.
- [ ] Candidate without GitHub/FSP data still completes the required route.
- [ ] Employer need can produce an explained shortlist and invitation without a published vacancy.
- [ ] Salary range and employer contact are visible before candidate acceptance.
- [ ] Cross-candidate access and cross-company disclosure are covered by API-level negative tests.
- [ ] Saved shortlist survives filter changes, page navigation, and refresh.
- [ ] Graph/list/status representations agree on the same data and reference level.
- [ ] Every visible action works or is explicitly unavailable with a reason; no placeholder chat/publication promise is presented as completed functionality.
- [ ] Documentation distinguishes tested mock behavior, proposed backend behavior, and unimplemented production integrations.
