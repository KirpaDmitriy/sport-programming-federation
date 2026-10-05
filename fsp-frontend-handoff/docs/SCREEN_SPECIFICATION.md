# Frontend screen specification

## Implementation rules

Build a working application around the ten mockups. PNGs define visual direction. This specification defines user behavior and missing states. The shared API contract defines wire fields, enum values, operation IDs, authorization, and errors.

All visible product copy is Russian. Technology names, source identifiers, code, and email addresses retain their original spelling. The UI consumes backend-shaped responses from the mock server. It must not derive grades, fabricate verification, rank candidates independently, or reveal hidden fields by switching CSS classes.

Screen IDs here are documentation IDs, not backend paths. Use the frontend route mapping in `mockups/manifest.json` together with the router plan. Every listed operation must map to a documented contract operation or be explicitly omitted as optional.

### Shared demonstration history

| Item | Canonical value |
|---|---|
| Candidate's own profile | Алексей Морозов, `alexey@example.com` |
| Employer-visible alias | Кандидат №024, neutral avatar; no personal initials |
| Specialization | Бэкенд |
| Before assessment | Джуниор confirmed on 2026-06-01; Мидл selected for the next assessment |
| Fixture clock | 2026-10-05T12:00:00Z; format through the application's locale/timezone rules |
| Grade-change policy | 90 days between successful grade changes; eligibility comes from the API |
| Source snapshot | Initial processing: GitHub 12 found, 8 processed, 3 queued, 1 unavailable; automatic completion changes this to 12/11/0/1 |
| Before Middle result | Rust checked; PostgreSQL evidence below target Middle threshold; Docker observed; Redis has insufficient evidence |
| After successful Middle assessment | Category becomes Бэкенд / Мидл; Rust and PostgreSQL have evidence sufficient for the modeled target; Docker/Redis do not silently upgrade |
| Employer | Север Тех |
| Employer contact | Марина, рекрутер; `hr@sever-tech.example` |
| Need/offer | Бэкенд-разработчик, Мидл, remote, 200 000–260 000 RUB per month before taxes |
| Required skills | Rust, PostgreSQL |
| Desired skills | Docker, Redis |

These are fictional fixture values. Treat “before assessment” and “after assessment” as different system states. Do not hardcode an upgraded result into a page while the API still reports Junior. Fixed historical dates painted into a PNG have no authority.

### Three separate status concepts

1. **Qualification:** verified specialization and grade, or no verified category yet.
2. **Evidence:** observation, supported inference, practical result, and the level/scope they cover.
3. **Need match:** how evidence satisfies a particular employer requirement and its evidence policy.

For example, candidate №018 can have verified Middle qualification and insufficient PostgreSQL evidence for this need. Docker can be “Найдено в работе” in the source view and “Есть основания” against an employer requirement without being verified. A passed Junior PostgreSQL task does not certify every Middle PostgreSQL requirement.

## S01. Candidate overview

**Reference:** `mockups/01-candidate-overview.png`.

**Purpose:** show current qualification, evidence, source status, and the next useful action.

**Content:** own identity; current verified specialization/grade; separately labeled selected grade; publication/contact visibility summary; compact skill evidence table; connected sources; latest assessment history; PDF export.

**Primary action:** `Начать проверку`, `Продолжить проверку`, or an eligibility explanation according to server state. For a first-time candidate use `Подтвердить уровень`; never show a confirmed-grade badge before a passed assessment.

**Operations:** read own profile/category, read source summary, read assessment eligibility/history, request/download profile PDF, navigate to privacy or assessment setup.

**States:**

- Empty profile: onboarding checklist with a direct next step.
- No confirmed category: `Уровень ещё не подтверждён`; explain why the candidate is not in the categorized bank yet.
- Partial source processing: display the last usable snapshot and processing status without blocking the profile.
- Existing attempt: resume its saved server state.
- Grade cooldown: show the next eligible date, preserve history and existing category, and allow unrelated profile editing.
- PDF pending/failed: visible progress or retry; a failed export does not blank the profile.

**Checks:** the category, skills, and PDF agree with the same profile version; a failed upgrade does not remove Junior; source absence does not prevent assessment.

## S02. Profile and goals

**Reference:** `mockups/02-profile-goals.png`.

**Purpose:** edit self-described data, choose the next assessment target, and control visibility.

**Required additions to the PNG:** explicit industry input/questionnaire result and a meaningful duration-of-experience field mapped to `experienceMonths` (nullable whole months). Narrative experience alone does not capture duration. Keep team role and self-reported soft skills clearly labeled.

**Content:** name, confirmed email, industry, specialization, selected grade, stack, experience duration and description, team role, self-reported soft skills. Email is the contact method in the core contract; do not add phone/social fields without extending the contract. The employer preview uses only the anonymized projection. A processing consent control and publication/discoverability control are separate.

**Actions:** save, cancel unsaved changes, import PDF, edit privacy. Changing an email address, if supported, must require re-verification; otherwise make the verified email read-only and route changes to account settings.

**PDF flow:** choose a PDF → validate format/size → upload → parse asynchronously → show extracted fields with unknowns left empty → candidate reviews/corrects → save. This review concerns imported resume fields, not manual approval of GitHub repositories. Resume claims cannot overwrite the confirmed grade. Parsing failure retains the original form values and offers manual entry.

**States:** field validation; upload in progress/cancel/failure; unsupported or unreadable PDF; extraction timeout/retry; server validation error; unsaved changes; save succeeded. Preserve input when saving fails and reconcile only conflicts defined by the operation. This contract has no general stale-edit precondition. Preview updates may be local for form feedback, but confirmed category and privacy changes take effect only after the server response.

**Copy:** `Контакты откроются, когда вы примете приглашение`. The candidate accepts the employer's invitation. The employer never “accepts” its own invitation to unlock contacts.

## S03. Profile sources

**Reference:** `mockups/03-profile-sources.png`.

**Purpose:** connect sources and explain what automatic enrichment has processed.

**Content:** GitHub link status; public-data scope; found/processed/queued/unavailable counts; last successful update; repository/source-item table with status; optional FSP ID card; contribution-attribution and observation-period explanations.

**Actions:** enter a source account identifier and connect through the explicit simulated source flow, refresh/synchronize, retry a failed supported operation, inspect own evidence. This does not verify real GitHub account ownership. No repository approval checklist or mandatory selection of “best projects”. The core API has no disconnect/report operation; hide those controls until it does. Never request a provider secret in the frontend.

**FSP states:** not linked; lookup pending; linked with synthetic achievements; linked with no history; identifier not found; temporary source failure. `Нет истории ФСП` is a valid result, not a validation error. Mark all synthetic FSP content `Демо-источник`. Do not make linking FSP a required onboarding step.

**Source interpretation:** a technology in a repository can be observed even when the candidate's relevant contribution is not established. Show attribution limits. Counts of commits, days, or public items do not measure hours worked or automatically confirm a skill.

**Coverage:** `found` is the total, not another progress segment. Initially 8 + 3 + 1 = 12; automatic completion changes the counts to 11 + 0 + 1 = 12 after approximately one second. Resume polling using `Source.activeJobId`, without sending an extra sync command. Assert the count invariant and state transition, not a permanently frozen screenshot. Use textual counts and an indeterminate processing indicator while the denominator or completion estimate is uncertain. If a determinate bar is used, derive it from contract-defined mutually exclusive statuses.

**Errors to design for:** authorization expired; disconnected account; source rate limit; inaccessible/private/deleted item; background analysis failure; complete empty source; partial success. These are frontend acceptance requirements, not a claim that every state has a dedicated HTTP mock scenario. Show a retry time only when the API supplies it. Preserve already valid results and identify stale timestamps. A “report incorrect data” action may be shown only if a real mocked operation or clear feedback flow exists.

## S04. Skills and evidence

**Reference:** `mockups/04-skills-evidence.png`.

**Purpose:** inspect the connection between competence, source observations, assessment evidence, and a target gap.

**Content:** list/graph switch; skill search; compact connected graph; selected-node inspector; evidence type; target/reference level; supplied dated provenance; source limitations; next available confirmation action. Render version identifiers only when present in the response or a resolvable referenced assessment. The core evidence record does not contain a general analyzer/rubric version field.

**Graph behavior:** selecting a node selects the same item as the list view and opens its inspector. Preserve selection when switching representations. Provide zoom in/out and fit controls, plus keyboard-accessible navigation. Do not rely on dragging for essential actions. Auto-layout should be stable across a refetch of unchanged data.

**Evidence details:** source facts, attributed contribution, model interpretation, and practical results remain separate. Candidate-owned views may include the candidate's source URLs and identifiers. Employer views require a separately sanitized projection, not reuse of this DTO. A source reference is clickable only when it resolves to an actual supplied URL or assessment record. A historical seed label without a corresponding record remains plain text; do not create a broken assessment link.

**Level context:** display `Подтверждено для Джуниора` or `Нужна проверка для Мидла` where a generic “Пройдено” would be ambiguous. Show missing data distinctly from a failed criterion.

**Gap actions:** open a supported practical assessment or a catalog item that explains a proposed event/competition. Synthetic events remain marked as demo; real schedule, difficulty, popularity, or acceptance claims require actual source data. The employer's chosen evidence policy determines whether an event is acceptable.

**States:** empty graph with a next step; loading inspector; missing/deleted source; stale analysis; no compatible assessment/event; graph rendering fallback to list. The list is a full alternative, not a decorative summary.

## S05. Practical assessment workspace

**Reference:** `mockups/05-assessment-workspace.png`.

**Purpose:** complete a comparable practical task with permitted AI assistance.

**Layout:** statement/materials on the left; one editable code buffer, explanation and checks in the center; assistant on the right. At smaller widths convert panels into accessible tabs. Keep the task, submission controls, and result feedback reachable without a horizontally overflowing whole page.

**Stages:** present setup/context, practice, and explanation as client-side steps over the supplied task. The core contract contains one task prompt, code answer, explanation answer, and final submission; it has no stage-transition endpoint. An adaptation condition can be shown only when supplied in the task prompt/acceptance criteria. Do not invent a second server task or an automatic follow-up transition from the pictured `Шаг 2 из 3`.

**Actions:** edit the supplied code answer, save draft, resume, run checks, inspect each check result, ask a simulated assistant question, and submit code plus explanation. Adaptation work, when included in the prompt, remains part of that answer. The core exercise is Rust-only and has one code field: show a fixed language label and omit unsupported file-creation controls.

**Evidence:** a successful API job, not frontend source-text matching, produces check results. The mock can return deterministic scenario outcomes, but must visibly identify simulated execution/evaluation. The sample Rust snippet in the PNG is illustrative and is not a complete assessment implementation or scoring oracle.

**Persistence:** editing updates dirty state; server acknowledgment controls `Черновик сохранён`. Debounce draft writes, flush intentionally before submit, and handle a rejected save after the attempt becomes read-only or the connection fails. Do not invent an expected-revision field. An accidental refresh must not silently erase an acknowledged draft. Do not persist real provider tokens in draft storage.

**Submission:** allow one active submission transition at a time; use the contract's retry/idempotency behavior. Duplicate clicks must not create duplicate attempts or change category twice. Submitted/assessing attempts are read-only unless the API explicitly returns another editable stage.

**Failure states:** syntax/check failure; timeout; sandbox/service unavailable; assistant unavailable; draft save failed; session expired; stale attempt; evaluation retry. Infrastructure failure does not mean an assessment failure and must not lower grade or consume a successful-grade-change cooldown.

**AI rule:** `ИИ разрешён, включая внешние инструменты`. This applies to code, checks, adaptation, and explanation. Do not add an AI-free final stage or plagiarism claim unsupported by the assessment design.

## S06. Assessment result and history

**Reference:** `mockups/06-assessment-result.png`.

**Purpose:** explain the finalized result and what changed in the profile.

**Content:** status; attempted level; prior/current verified category; rubric criteria and explanations; check outcomes; evidence added; remaining gaps; history link; profile/PDF actions. Criterion values come from the API. A four-check exercise alone is not a claim that all professional competence has been certified.

**Successful upgrade:** show the confirmed new category only after the final result and updated profile are available. Invalidate/refetch profile, graph, category, eligibility, and dependent matching queries. Do not overwrite unrelated evidence.

**Other required variants:**

- Initial assessment not passed: no verified category assigned; offer an eligible retry or voluntary lower target.
- Upgrade not passed: previous confirmed grade remains; show concrete criteria to improve.
- Assessment processing: “Решение проверяется”, preserving prior grade.
- Technical evaluation error: retry state with no qualification penalty.
- Cooldown: next grade-change date and reason returned by API.
- Historical result: the attempt's original rubric/outcome remains visible even if the profile later changes.

**History view:** list attempted specialization/grade, date, status, result, and the category effect. Open immutable result details. Distinguish eligibility for a grade change from ordinary navigation, source refresh, or a non-grade practice task.

## S07. Employer need editor

**Reference:** `mockups/07-employer-need.png`.

**Purpose:** describe the hiring need and define the criteria used in matching.

**Content:** title, team/work description, specialization, required grade, work format, salary minimum/maximum, skill requirements, each requirement's criticality/target level, accepted evidence policy, and company summary. The core contract fixes currency to RUB, period to month, and basis to gross. Display `₽/мес` and `До вычета налогов` as read-only labels; do not expose a net-pay or period selector.

**Actions:** save draft, save and find candidates, add/edit/remove requirement, configure evidence policy. Company profile/contact completeness must be checked before an invitation can be sent. Editing a need never mutates the terms of an already sent invitation.

**Requirements:** separate required from desired criteria. A missing required skill is visibly reported; desired skills cannot silently compensate for it. Default evidence policy may be overridden per requirement. Display only supported options, such as assessment results, attributed source evidence, or selected synthetic FSP event evidence from a catalog.

**Graph relationship:** the main editor can remain a structured table. It represents requirement nodes and their priority/accepted-evidence edges. An optional graph view must edit the same underlying contract, not a second independent model.

**Validation:** missing title/description/specialization/grade; duplicate skill; unsupported evidence policy; empty, reversed, non-positive, fractional, or otherwise invalid salary; absent company contact. Salary bounds are positive whole rubles. Keep user input after errors. Form previews derive from form values; search starts only after the need is saved.

**Optional controls:** publication is off unless the full vacancy capability exists. Need import from PDF/text may be omitted until its parsing and error contract exists. Remove drag handles if ordering has no defined behavior. None of these omissions blocks named invitations.

## S08. Employer search and saved shortlist

**Reference:** `mockups/08-candidate-search.png`.

**Purpose:** find qualified candidates and keep a durable selection while refining the search.

**Content:** active need; recommendations/full-bank switch; filters for specialization, verified grade, category, stack, and confirmed FSP achievements; result count; categorized match groups; pseudonymous result rows; saved shortlist panel. Show the backend's default ranking as a read-only `По соответствию` label. Add a sort selector only when a corresponding enum/query parameter is implemented in the shared contract.

**Result row:** alias and neutral avatar, verified qualification, relevant skill/evidence summary, required-criterion coverage, concise gap/reason, bookmark action. Candidate №018 remains a verified Middle while its PostgreSQL requirement needs more evidence. Candidate №024's missing desired Redis evidence must not downgrade its qualification.

**State ownership:** query parameters hold current search/filter/pagination state for supported contract parameters. The mock server owns shortlist IDs and membership. A filter change must not reset, replace, or silently prune saved entries. Previously saved candidates not in the current results remain in the shortlist. A candidate made unavailable is a marked unavailable entry without cached hidden details, rather than a privacy bypass.

**Bookmark consistency:** the same membership drives the result row, profile action, shortlist count, and side panel. Screen 08's saved candidate №018 must display a selected bookmark wherever present. Optimistic toggles must roll back on server failure.

**Errors/states:** no need yet; no matches; filtered-out candidates; loading first query; refetch preserving previous results with loading indication; stale request canceled/ignored; search failure with retry; shortlist mutation failure; unavailable candidate; stale need/match version. Clear-filter and adjust-need actions should be visible when no candidates match.

**Matching explanation:** render returned requirement statuses/reasons. Never invent a confidence percentage or rank by commit count. The “all bank” mode includes all eligible, discoverable candidates within access rules, not undisclosed users or unconfirmed resume claims.

## S09. Candidate as viewed by an employer

**Reference:** `mockups/09-candidate-employer-view.png`.

**Purpose:** assess a candidate against a particular need and prepare a named invitation.

**Content before disclosure:** alias, neutral avatar, verified specialization/grade, availability, requirement-level match results, generalized evidence, limitations, need/salary summary, shortlist action, invite action.

**Must be absent before consent:** actual name, personal initials/photo, candidate email/phone, GitHub handle, repository title/URL, SHA, identifying code or unique quotations. These values must not exist in hidden DOM, network payloads, preloaded query cache, analytics, page metadata, downloads, or accessible descriptions.

**Evidence expansion:** explain the kind of observed work and the relevant test outcome. Use a sanitized account of contribution, such as `Найдены изменения транзакционной логики и тестов в публичном проекте`. This does not authorize a link to that project before source disclosure.

**Invite action:** opens a composer with the candidate alias, offer text, immutable-on-send salary/terms snapshot, company/contact preview, and send action. Publication is not a prerequisite. Success updates the invitation list and prevents accidental duplicate sends according to server rules.

**After acceptance:** show only fields granted to the current company. Unselected source links stay hidden. Changing to a second employer session still shows the pseudonymous projection. If access is later changed, refetch the projection and clear unavailable cached details; do not promise that previously received data can be erased from the recipient's records.

**States:** candidate unavailable/not discoverable; match recalculating; evidence unavailable; already invited; invitation accepted/rejected; send failure; concurrent update. No UI authorization flag may independently reveal the private profile DTO.

## S10. Candidate invitation detail and decision

**Reference:** `mockups/10-candidate-invitation.png`.

**Purpose:** review a concrete offer and decide what to disclose to that company.

**Content before acceptance:** company name/description, role and work, salary from/to in RUB with period and basis, work format, employer contact, sent/viewed/status information, selected-disclosure preview.

**Actions:** accept with explicit disclosure selection or reject. Explain recipient company and fields before submission. If the contract requires at least one contact method, validate that selection before acceptance and explain why; do not accept an invalid empty selection silently. Selecting source links is independent of sharing a contact.

**State transition:** opening the detail may record viewed status through the documented operation. Accept/reject submits one explicit decision; the server atomically checks the invitation's current state. The contract has no invitation revision/precondition field. Handle its terminal-state `409` conflict by refetching and showing the canonical state. The employer sees the same update on refetch. Repeated acceptance must not broaden a previous grant or create another disclosure event.

**Accepted:** show the offer snapshot, selected fields shared, recipient, and decision date. The next action may be to contact the employer through the already visible contact method. In-app chat is outside the core handoff and must not be promised unless implemented.

**Rejected:** preserve terms/status in history; no contact/source grant is created.

**Unavailable/expired/withdrawn:** if supported by the contract, disable obsolete decisions, explain the current state, and retain readable terms. Handle a stale response when another tab already decided. A failed accept request keeps contact access closed until the server confirms the transaction.

**Isolation:** accepting for Север Тех grants only that recipient company under the recorded invitation. Other employers continue to receive the anonymous DTO. Candidate cannot read another candidate's invitation by changing the ID.

## Required auxiliary screens and panels

The ten PNGs do not cover these states. Reuse the same design system and implement them as routes, dialogs, or tabs as appropriate.

| ID | Screen or panel | Minimum behavior |
|---|---|---|
| A01 | Registration and sign-in | Candidate/employer role choice; email registration; chosen authentication method; form validation; loading/error states; return to intended route. |
| A02 | Email confirmation | Pending code, verified success, invalid/expired/reused code, and request for a new challenge. Show a resend delay only when the API supplies one. Clearly mark the local demo-mail mechanism. |
| A03 | Initial candidate onboarding | Processing/publication choices, profile entry/import, industry/specialization questionnaire, target grade, assessment eligibility. No FSP prerequisite. |
| A04 | Assessment setup | Explain target, rubric/stages, permitted AI, current grade preservation, eligibility, and the start/resume action. |
| A05 | Explanation step | Edit the answer's explanation; show an adaptation instruction only if supplied in the task prompt/criteria. AI remains permitted. This is a UI step, not a new server stage. |
| A06 | Assessment history | Attempt list and immutable details; failed-first, failed-upgrade, successful, processing, and technical-failure variants. |
| A07 | Candidate invitation list | Status filtering, salary/role/company summary, unread/viewed distinction, empty state, and detail links. Only own invitations. |
| A08 | Company profile | Company name, description, `businessArea`, and contact email; edit/save/validation states. Contact-person name is optional display only when supplied. No fake verified-company badge. |
| A09 | Employer needs list/detail | Create/open/edit draft and saved needs; active version; selected need for recommendations. |
| A10 | Evidence-policy editor | Default and per-requirement accepted evidence; optional specific synthetic competition/event selectors; explicit target level and limitations. |
| A11 | Employer invitation composer/list | Complete offer/salary/company/contact preview, send, per-invitation status, read-only sent terms. Works without a vacancy. |
| A12 | Shortlist create/detail | Create/name, add/remove candidates, preserve across filters, open current candidate projection, show unavailable entries safely. |
| A13 | PDF import/export status | Upload/parse review, format/size/unreadable errors, generated-file readiness/download/retry. |
| A14 | Account/privacy/source settings | Processing consent, publication/discoverability, linked sources, recorded disclosure context where supported. Sign-out clears session-specific cached data. |
| A15 | System states | Unauthorized, forbidden, not found, offline/network failure, rate limit with retry time, unknown server error, and safe retry. |

Password reset is required only if password authentication is part of the chosen contract. This passwordless verified-email flow uses a challenge ID and six-digit code, including invalid/expired-code recovery. Do not implement incompatible parallel authentication models just because a generic login template contains both.

## Shared interaction requirements

### Loading, errors, and concurrency

- Initial loading uses layout-matching placeholders with a readable status. Later refreshes preserve useful data and indicate that it may be stale.
- Every form has visible labels, field errors, and a submit-level failure message. Keep values after an error.
- Use server-provided eligible/retry timestamps. Show exact dates as well as any human-friendly countdown.
- Session expiry clears private queries, protects unsaved work where possible, and sends the user through sign-in. Do not reuse another account's cached profile after a role/demo account switch.
- Stale mutations must show the current state and an appropriate retry path. Acceptance, disclosure, category changes, and assessment submission wait for server acknowledgment.
- Error messages describe the user's next action without dumping stack traces, model prompts, credentials, or hidden profile fields.
- Never render an empty state while a query is still loading or has failed. “No FSP history” and “FSP service unavailable” are different states.

### Responsive priority

Desktop is the organizer's core platform. Implement a responsive layout without letting additional mobile work delay the complete core flow.

| Width | Layout behavior |
|---|---|
| 1280px and wider | Persistent sidebar; two-column forms/details; three-pane assessment when content remains readable. |
| 1024–1279px | Compact/collapsible navigation; two-column primary content; assistant/evidence panels may use tabs or a drawer. |
| 768–1023px | Drawer navigation; stacked form/preview; shortlist accessible as a separate panel; graph defaults to a compact list when necessary. |
| Below 768px | Single column; compact header; full-width actions; filters in a dialog; graph list fallback; assessment panes as tabs. Preserve essential controls and status text. |

These are implementation breakpoints, not exact measurements extracted from the images. Test long Russian text, large fonts, empty/long names, narrow windows, keyboard focus, and zoom. Data tables may scroll within a labeled region; the entire page must not overflow because of a fixed desktop canvas.

### Accessible equivalents

The graph has a full list/detail equivalent. Icon-only buttons have Russian accessible names. Status uses text and icon, not color alone. Dialogs manage focus and restore it to the invoking control. Search filters, bookmark actions, tabs, and the code editor are keyboard-operable. Use the detailed design checklist in `DESIGN_SYSTEM.md`.

## Cross-screen acceptance scenarios

1. Register an initially unverified candidate, confirm email, complete questionnaire, choose a grade, submit an assessment, and receive a verified category without linking FSP.
2. Resume candidate №024's Junior profile, observe partial GitHub enrichment, pass Middle, and see the updated grade on overview, graph, employer search, profile, and PDF.
3. Fail the Middle upgrade and verify that Junior remains on every view; simulate a technical evaluation failure and verify that no grade change occurs.
4. Create a need with publication disabled, find candidates, save №018 and №024, change filters so №018 disappears, and verify that it remains in the shortlist with consistent bookmark state when shown again.
5. Send a named invitation containing salary and employer contact; open it as the candidate, accept selected contact fields, then verify that only the sending company sees those fields.
6. Reject an invitation and verify that both parties see rejection and no candidate contact/source information is disclosed.
7. Attempt cross-candidate and cross-company access through direct requests, not only UI navigation, and verify that responses contain no hidden data.
8. Simulate loading, API failure, expired session, duplicate submission, stale invitation decision, empty FSP history, unavailable source, and invalid salary. Every state must have an accurate message and recovery path.
