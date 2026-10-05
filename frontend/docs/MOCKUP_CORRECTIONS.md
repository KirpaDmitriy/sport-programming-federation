# Mockup review and implementation corrections

## What the files are

The archive contains ten final raster UI references. Use the filenames and hashes in `mockups/manifest.json`. The images illustrate a set of linked demonstration states; they are not executable screens, API contracts, complete form schemas, or evidence that external services were used.

All ten images were visually reviewed against the organizer PDF and agreed product rules. Screens 08 and 10 were revised again during this handoff and the revised versions were inspected. Earlier generated variants are not the implementation references.

Order of interpretation:

1. Required organizer behavior and explicit product decisions recorded in the handoff.
2. Shared API contract and [`PRODUCT_RULES.md`](../../docs/product/PRODUCT_RULES.md) for wire/state rules.
3. `SCREEN_SPECIFICATION.md` and this correction register for user behavior.
4. `DESIGN_SYSTEM.md` and provided tokens for reusable UI treatment.
5. Pixels for layout, visual hierarchy, and composition.

If an image conflicts with the text/contract, implement the text/contract and record the visual adjustment. If the contract contradicts a required product rule, fix that discrepancy rather than using the image to bypass the rule.

## Corrections already included in final images

| Screen | Resolved issue | Rule to retain in implementation |
|---|---|---|
| 02 | The employer preview now has an anonymous icon, not the candidate's personal initials. | Employer-facing preview must use the anonymous DTO. |
| 02 | Contact-unlock wording now says that the candidate accepts the invitation. | The employer cannot unlock data by accepting its own invitation. |
| 02 | Processing consent explanation is separate from employer visibility. | Processing, publication, and contact disclosure are independent decisions. |
| 03 | Coverage is textual, with a neutral processing indicator instead of a misleading four-part total. | Found is the total; 8 processed + 3 queued + 1 unavailable = 12 found in this snapshot. |
| 04 | Docker uses a neutral observation icon instead of a verified check. | Observed technology is not a confirmed skill. |
| 08 | Candidate №018's qualification is shown as verified, while PostgreSQL still needs verification. | A verified category and a requirement-specific evidence gap can coexist. |
| 08 | Candidate №018's bookmark is filled because this candidate is already in the saved shortlist. | Membership drives selected state across result rows, profile actions, and shortlist panels. |
| 10 | The bottom card explains direct contact after acceptance and no longer promises in-app chat. | Core scope is contact exchange. Do not add a nonfunctional chat panel. |

## Per-screen implementation adjustments

### 01. Candidate overview

- The painted assessment-history date is illustrative. The canonical pre-upgrade confirmation is 2026-06-01; the fixture clock is 2026-10-05T12:00:00Z.
- The overview shows an existing Junior candidate who can attempt Middle. Also implement a new unverified candidate, active attempt, cooldown, failed upgrade, and completed-upgrade state.
- Show source count and status from the API. Do not paste `8 из 12` into a static card disconnected from the source page.
- `Скачать PDF` must download a document representing the correct current profile. A unrelated placeholder PDF is not a completed export flow.
- Notifications/history links must open working views or be omitted.

### 02. Profile and goals

- Add explicit industry and experience-duration data through the profile/onboarding flow. The image's narrative experience field is not a complete organizer field model.
- Do not treat `Мидл` selected in the form as the confirmed grade. The image correctly shows Junior confirmation separately; preserve this separation in data and validation.
- The verified email field is either read-only or uses a defined change/re-verification flow. Editing it must not retain an unrelated “confirmed” check.
- Painted character counters are approximate visual content. Compute counters and enforce the actual contract limit consistently.
- PDF parsing must leave unknown fields empty, retain the previous form on failure, and never invent skill verification.
- The publication toggle controls discoverability; it does not grant all companies access to contacts or source links.

### 03. Profile sources

- The repository table shows a subset of the total. Implement the table/pagination from actual fixture records and returned counts, not duplicated visual rows.
- A queued, inaccessible, private, deleted, or rate-limited source item needs a truthful status and recovery path. An unavailable source is not “no evidence of competence”.
- Connecting a GitHub account starts automatic enrichment. Do not insert a portfolio approval queue.
- No FSP API/schema exists in the organizer materials. Any FSP data shown here is synthetic and must retain its demo label.
- The data-error report link requires an implemented feedback operation. The core contract has no report/disconnect operation; hide these controls until supported.
- Keep the prohibition on inferred work hours. A repository's presence or language list is not proof of personal contribution.

### 04. Skills and evidence

- The PostgreSQL inspector includes a passed Junior task while the profile targets Middle. Make the reference level visible so the evidence state is understandable.
- Graph edges express typed relationships, not a mathematical or probabilistic claim drawn from their length, node size, or placement.
- The graph is one view over structured data. Provide a full accessible list/detail view and avoid separate state that can disagree with the graph.
- A source reference or historical assessment label is not automatically a resolvable link. Open only supplied URLs/existing assessment records, and show only provenance/version fields that actually exist.
- Source URL/PR details are permitted in the candidate's own inspector. Never reuse this unsanitized panel for the employer.
- A next-step action must resolve to an implemented assessment or catalog entry. Do not generate a plausible real competition name/date when none was supplied.

### 05. Assessment workspace

- The Rust snippet is illustrative. It is not the complete solution, hidden answer, reference implementation, or scoring logic.
- `2 из 4 пройдены`, result durations, saved time, and step count are scenario data. Update them from the mock API instead of keeping screenshot constants.
- The mock does not execute code or consult an actual model. Identify simulated checking/assistant behavior; do not claim an evaluation occurred solely because an animation finished.
- Provide setup, explanation, and resumed/processing/error states around this selected practice view. The core API has one task and one code/explanation answer. Adaptation instructions must come from the supplied prompt/criteria; there is no additional server stage-transition endpoint.
- AI is allowed during all stages. Do not introduce an AI-free defense stage.
- Fixed-language exercises should not expose a nonfunctional language selector. File-creation controls require actual supported behavior or should be removed.
- The double “run” affordance in the image can be simplified to one primary run action and per-check detail actions if that gives a clearer hierarchy.
- Persist an acknowledged draft and distinguish technical failure from a failed criterion. Never label unsaved work as saved before acknowledgment.

### 06. Assessment result

- This image is the successful-upgrade branch. Implement first failure, failed upgrade, pending evaluation, technical failure, cooldown, and historical results as well.
- Confirmed criteria/skills must have explicit scope. Passing this small demonstration task does not verify every Rust/PostgreSQL topic or overall employability.
- Category and evidence changes come from the finalized API outcome. A successful-looking result card must not run ahead of the actual profile update.
- Changing the grade requires dependent overview, graph, search, and PDF data to refresh. Unrelated Redis/Docker evidence remains unchanged.

### 07. Employer need

- Optional publication is disabled by capability in the core handoff. Hide the publication toggle when the full publication/self-application flow is absent.
- PDF/text import and drag handles are optional affordances. Omit them until implemented; manual need entry must remain complete.
- Add target level and per-requirement evidence policy details using an editor or expandable row. The compact table is a visual summary of this model.
- Add access to company profile/description/contact editing. A candidate must see the employer's contact in a received invitation before accepting.
- Salary minimum and maximum are validated positive whole-ruble values. Currency, monthly period, and gross basis are fixed by the core contract. Replace the pictured basis selector with the read-only label `До вычета налогов`. Counters and summary quantities derive from entered data.
- Saving a need and searching does not require vacancy publication. Already sent invitations retain their own terms snapshot after need edits.

### 08. Candidate search

- The pictured search is the post-upgrade state. Before candidate №024 passes Middle, do not inject that candidate into a verified-Middle result merely to match the PNG.
- The count `3`, group counts `2`/`1`, and shortlist count `3` describe this fixture snapshot. Derive current values from the API and memberships.
- The current contract returns the default relevance order. Use a read-only `По соответствию` label instead of the pictured sort dropdown until alternative ordering is contracted.
- Candidate №041 can remain saved even if absent from the current filter result. This is intentional shortlist persistence, not necessarily a search defect.
- Qualification, required-skill coverage, and desired-skill gaps are distinct. Missing desired Redis evidence does not invalidate №024's two satisfied required criteria.
- Selected bookmark state must stay synchronized after add/remove, failed save, query change, and refresh.
- `Весь банк` still respects visibility and category eligibility. It is not an authorization bypass.

### 09. Employer-facing candidate

- Replace illustrative dates with fixture/server timestamps.
- Use an employer-specific response projection. Identity, source names/URLs, SHAs, code, and unique quotations must be absent before the candidate grants them.
- Requirement-level match explanations must distinguish observed evidence from confirmed scope. The general category badge cannot substitute for a PostgreSQL requirement check.
- The invite action opens a complete composer or equivalent review step containing offer text, salary, company, and employer contact. Do not send a blank invitation from the profile button.
- After acceptance, only the chosen fields for the current company become available. Source links can remain hidden even when email is shared.

### 10. Candidate invitation

- The final file uses the corrected direct-contact card. In-app chat is outside core scope.
- The candidate sees the employer's description/contact and full salary terms before deciding. Candidate contacts are shown here because this is the candidate's own view.
- Disclosure checkboxes represent actual granted fields. Read the acceptance schema to validate permitted fields and required contact selection.
- Acceptance is server-confirmed and company-scoped; viewing or checking a box alone grants nothing.
- Include accepted, rejected, stale/withdrawn, submitting, and request-failed variants. Both sides must converge on the same status.
- Preserve the sent offer terms in history. Editing the underlying need must not silently change what the candidate previously accepted.

## Scope omitted from the ten pictures

The implementation still needs the auxiliary views in `SCREEN_SPECIFICATION.md`: email registration/verification, onboarding questionnaire, assessment setup/adaptation/history, company profile, invitation lists/composer, shortlist management, PDF states, and account/privacy settings. These are part of the working flow; having ten visually complete pages does not cover them automatically.

Published vacancies, candidate self-applications, recurring employer tasks, ATS integration, employer moderation, and chat are separately scoped capabilities. Hide unsupported controls. The absence of an optional function should not leave a broken path in the primary workflow.

## Visual defects that must not be copied

- Approximate raster text, dates, file counts, counters, code, and durations.
- Low-contrast pale gray/purple labels; use the checked semantic tokens.
- Fixed desktop geometry that clips on a narrower viewport or when Russian text wraps.
- Icons without accessible names, color-only verification, or a graph without keyboard/list access.
- Labels that equate “not observed” with “cannot do” or a partial skill signal with an unverified grade.
- Buttons, tabs, selectors, notifications, download links, or toggles that only look functional.

## Review completion rule

For each implemented reference state, check the visible composition, underlying data, action behavior, and failure variant. Sensitive states additionally require inspection of the response payload and company/candidate isolation tests. A screenshot comparison cannot prove state correctness or privacy.
