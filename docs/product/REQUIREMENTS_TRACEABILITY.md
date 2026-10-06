# Requirements traceability

How each requirement of the organizer's specification ([`sources/organizer-spec.pdf`](sources/organizer-spec.pdf),
printed page numbers) is covered by the current code. Rules are detailed in [`BUSINESS_RULES.md`](BUSINESS_RULES.md);
screens in [`frontend/docs/SCREENS.md`](../../frontend/docs/SCREENS.md); tests in
[`frontend/docs/TESTING.md`](../../frontend/docs/TESTING.md). "Mock test" refers to
[`mock-server/test/mock-api.test.ts`](../../mock-server/test/mock-api.test.ts), "e2e" to `frontend/e2e/`.

Status: **done** — implemented end to end against the mock API; **done, simulated** — the workflow is implemented,
the underlying data or evaluation is a fixture; **not implemented**.

The specification supplies no FSP API, schema or dataset (§2, p2; §4, p6), so every FSP record here is synthetic.

## Required MVP behavior

| ID | Requirement | Status | Implementation | Evidence |
| --- | --- | --- | --- | --- |
| OR-01 | Two role workspaces, candidate and employer (§2.1, p3) | done | `/candidate/*` and `/employer/*` behind role guards; the API checks the role of every call | e2e auth «UI-25 roles are separated…» |
| OR-02 | Registration by e-mail with confirmation (§2.2.4, p4) | done, simulated | E-mail code flow on `/login`; the code goes to a demo mailbox instead of a real letter | e2e auth «UI-01 …» (two cases), unit `login-page.test.tsx`, mock test «email verification…» |
| OR-03 | Profile by form or PDF extraction: name, contacts, stack, grade, roles, experience, soft skills (§2.1, p3) | done, simulated | Profile form; PDF import with editable preview and explicit confirmation. The mock returns a fixed preview instead of parsing the file | e2e candidate «UI-04 PDF import…» |
| OR-04 | Standardized PDF profile (§2.1, p3) | done | «Скачать PDF» on the overview and the assessment result; the server renders the current profile | e2e candidate «UI-10 UI-12 UI-05 … the PDF is real», mock test «PDF export…» |
| OR-05 | Mandatory questionnaire with industry and specialization (§2, p1; §2.1, p3) | done | `/candidate/onboarding`; a new candidate lands there after sign-in | e2e candidate «UI-02 UI-07 …» |
| OR-06 | The candidate selects the grade to test (§2, p1) | done | `selectedGrade` is the target, shown apart from the verified grade | unit `qualification/ui.test.tsx`, mock test «profile category is server-owned…» |
| OR-07 | Testing with comparable difficulty and resistance to leaked tasks (§2, p1–2) | done, simulated | One task family with per-grade variants, a shared weighted rubric, server-side draft, checks, explanation, history. Code is not executed; outcomes come from the mock scenario | e2e candidate «UI-10…», «UI-13…», «UI-14…»; mock test «assessment workflow…» |
| OR-08 | Employer-visible category from questionnaire and passed assessment (§2, p1; p4) | done | Visibility needs verified e-mail, questionnaire, passed assessment and both consents | mock test «profile category is server-owned…», e2e «UI-02 UI-07…» |
| OR-09 | No forced downgrade after a failure; lower or higher attempts by choice (§2, p2) | done | A failed attempt keeps the verified grade. Until a grade is verified any target can be chosen; after that, attempts below the verified grade are refused so the verified grade never drops | e2e «UI-13 a failed upgrade keeps the verified Junior grade», mock test «same-grade retry…» |
| OR-10 | Time restriction on grade changes; interval chosen by the team (§2, p2; §2.1, p3) | done | 90 days after a successful grade change, configurable; same-grade retries and failures add none | e2e «UI-15 cooldown comes from the server», mock test «same-grade retry…» |
| OR-11 | Current industry, specialization, grade and history (§2.1, p3) | done | Overview, «Профиль и цели», «Проверки» history with immutable results | e2e candidate suite |
| OR-12 | Optional FSP ID; absence of history works (§2, p2; §2.1, p3) | done, simulated | FSP card on «Источники»; no history and a failed lookup are distinct states | e2e «UI-06 …» (two cases), mock test «scenario reset… no-FSP…» |
| OR-13 | Company profile with description, business area, contacts (§2.1, p3) | done | `/employer/company`; invitations need a complete profile | e2e employer suite |
| OR-14 | Employer describes the need: work, stack, specialization, grade (§2.1, p3) | done | Need editor with requirements, criticality, minimum grade and evidence policy | e2e «UI-16 …», mock test «need CRUD…» |
| OR-15 | Recommended categories and candidates with reasons (§2.1, p3; p4) | done | Recommended mode grouped by match status with per-requirement reasons; «Соответствие» tab on the profile | e2e «UI-18 required coverage…» |
| OR-16 | Search the whole bank with filters: specialization, grade, category, stack, confirmed FSP (§2.1, p3) | done | «Весь банк» mode; filters for verified specialization and grade, stack and verified FSP live in the URL | e2e «UI-17 UI-19 filters live in the URL…» |
| OR-17 | Ranking by confirmed profile, assessment and FSP; search by need fit with explanation (§2, p1; p4) | done | Deterministic server order (grade fit, required, desired, FSP as a tie-breaker) | mock test «candidate bank is anonymous, deterministic…» |
| OR-18 | Changing filters does not lose the shortlist (p4) | done | Shortlists are a persisted company resource independent of filters | e2e «UI-17 UI-19 …», «an emptied bank keeps saved shortlist entries…», mock test «shortlists persist…» |
| OR-19 | Invite a candidate with an offer without publishing a vacancy (§2, p2; §2.1, p3) | done | Invitation composer from the candidate profile; needs are never published | e2e invitations suite |
| OR-20 | Mandatory salary range in RUB in every offer (§2.2.1, p4) | done | Whole-ruble monthly gross range validated in the form and on the server | unit `need-form.test.ts`, e2e «UI-16 salary validation…» |
| OR-21 | Offer shows description, salary, company and employer contact before communication (§2.2.1–2, p4) | done | Candidate invitation page shows the frozen terms and the company contact before the decision | e2e «UI-20 UI-21 UI-23 …» |
| OR-22 | Accept or decline; both sides see the status (§2.1, p3; §2.2.3, p4) | done | Candidate decision, employer withdrawal, statuses and timeline on both sides | e2e «UI-22 …», «UI-24 …», unit `invitation-decision.test.tsx` |
| OR-23 | No candidate contacts for the employer before acceptance (§2.1, p4; §2.2.2, p4) | done | Anonymous projection everywhere; contacts only through the per-company disclosure resource after acceptance | e2e «UI-20 UI-21 UI-23 …», mock test «direct invitations… disclose only selected fields…» |
| OR-24 | A candidate sees only their own invitations (§2.1, p3) | done | Server scoping answers `404` for other records | mock test «health, request validation, session, role…», «direct invitations…» |
| OR-25 | Privacy settings, processing and publication consent, role-based access (§2.1, p3; §3.5, p6) | done | Separate processing and publication consents; disclosure per invitation and company | e2e «UI-02 UI-07 …», mock test «profile category…» |
| OR-26 | End-to-end demo: registration → questionnaire → assessment → category → search → invitation and contact (§3.3, p5) | done | Full path on the HTTPS stand; scripted in [`DEMO_SCRIPT_RU.md`](../../frontend/docs/DEMO_SCRIPT_RU.md) | e2e public «a new candidate and two companies complete the reverse-hiring flow» |

## Optional scope

| Feature | Organizer position | Status |
| --- | --- | --- |
| Vacancy browsing, self-application, application history | Desirable, not MVP (§2.1, p3) | not implemented; capability reported as off, no controls |
| Vacancy publication and incoming applications | Desirable, not MVP (§2.1, p4) | not implemented; needs stay unpublished |
| Recurring short employer tasks | Desirable, not MVP (§2.1, p3) | not implemented |
| Anti-fraud checks for employers, ATS integration | After MVP (§2, p2–3) | not implemented; no «verified company» badge |
| Keycloak or FSP ID sign-in | Future recommendation (§2, p2; §3.5, p6) | not implemented; e-mail sign-in only |
| Mobile and tablet layout | Optional (§3.5, p6) | done: responsive layout with a navigation drawer below 1024 px, checked without horizontal scroll (e2e accessibility «narrow screens reflow…») |
| In-app chat | Not required | not implemented; parties contact each other directly after acceptance |

## Outside the current code

Production security, personal-data compliance, real e-mail delivery, live GitHub/FSP integrations, code execution
and measured assessment or matching quality are not covered by the mock and remain backend work
([`BUSINESS_RULES.md` §13](BUSINESS_RULES.md#13-capabilities-and-simulation)).
