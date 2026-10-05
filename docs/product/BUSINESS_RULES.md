# Business rules

The rules the platform implements today. The domain logic lives in the mock API
([`mock-server/src/domain.mjs`](../../mock-server/src/domain.mjs), seed data in
[`data.mjs`](../../mock-server/src/data.mjs)); the frontend renders its decisions and never re-computes grades,
eligibility, matching or access. The Rust backend must reproduce these rules
([`backend/README.md`](../../backend/README.md)). Wire fields and enums are defined in
[`contracts/openapi.json`](../../contracts/openapi.json); transport rules (session, errors, idempotency, jobs) are in
[`contracts/API_INTEGRATION.md`](../../contracts/API_INTEGRATION.md). Russian interface labels are quoted where they
name a state.

## 1. Accounts and access

- Two roles, `candidate` and `employer`. An account has one role, fixed at registration: asking for a code or
  verifying with the other role fails with `409 role_mismatch`.
- Registration and sign-in are the same passwordless flow: request a challenge for e-mail + role, enter the
  six-digit code, receive a session. A new e-mail creates an account: a candidate gets an empty, unverified profile
  with the alias «Кандидат №NNN» and no consents; an employer gets a new, empty company whose contact e-mail is the
  sign-in address.
- A code is valid for 15 minutes of server time, works once (`409 challenge_used`) and locks after five wrong
  attempts (`429 challenge_locked`); a wrong or expired code is `400 invalid_code` / `400 challenge_expired`.
- The session is an opaque `HttpOnly`, `SameSite=Lax` cookie. Without it every protected call is `401`.
- A candidate reaches only their own profile, sources, skills, assessments, jobs and invitations; an employer only
  their own company, needs, shortlists and invitations. Someone else's record answers `404`, so its existence is not
  revealed; a call for the other role answers `403 role_forbidden`.

## 2. Candidate profile

| Owner | Fields |
| --- | --- |
| Candidate (editable) | `name`, `industry` (only `it`), `specialization` (`backend`/`frontend`/`fullstack`), `selectedGrade` (`junior`/`middle`/`senior`), `stack` (up to 5 of `rust`, `postgresql`, `docker`, `redis`, `react`), `teamRole`, `experienceMonths` (`null` unknown, `0` none, up to 1200), `experience`, `softSkills` (up to 12, self-assessed), `consents` |
| Server | `verifiedSpecialization`, `verifiedGrade`, `gradeConfirmedAt`, `category`, `onboarding`, `assessmentEligibility`, `revision` |

- `selectedGrade` is only the target of the next assessment («Цель»). Changing it never changes `verifiedGrade`;
  only an assessment result does.
- The questionnaire is complete when name, specialization, selected grade, at least one stack item, team role and
  experience are filled.

### Visibility to employers

A profile appears in employer search only when all five conditions hold; `onboarding.blockers` names the missing
ones and the UI lists them on the overview, profile and settings pages:

| Condition | Blocker |
| --- | --- |
| E-mail verified | `email` |
| Questionnaire complete | `questionnaire` |
| A passed assessment (verified specialization and grade exist) | `assessment` |
| Processing consent | `processing_consent` |
| Publication consent | `publication_consent` |

`category` is `{ specialization, grade, eligible }` built from the verified values; `eligible` equals visibility.

### Consents

- **Processing** («Согласен на обработку данных») is required for PDF import and its confirmation, connecting and
  syncing sources, and for starting, saving, checking, submitting and discussing assessments
  (`403 processing_consent_required`). Revoking it makes unfinished jobs fail with `processing_consent_revoked`
  (retryable) without applying their result; an attempt that was being evaluated ends as `service_error`.
- **Publication** («Показывать профиль работодателям») only controls appearance in search. The two consents are
  independent and saved separately; the UI shows a change only after the server confirms it.

## 3. Sources and evidence

- Two providers, GitHub and FSP. In the mock both are synthetic (`synthetic: true`, links under
  `example.com/fixtures`), and the UI labels them «Демо-источник».
- Connecting a source (an account label) requires processing consent and starts a `source_sync` job at once; there
  is no manual repository selection. A connected source can be synced again (`409 source_not_connected` otherwise);
  while a sync runs, another request returns the same job. Disconnecting is not supported.
- GitHub reports `found` (total), `processed`, `queued` and `unavailable` repositories; a finished sync processes the
  queued ones, unavailable ones stay unavailable. Active days and the observation period are observations; there is
  no worked-hours value.
- When a GitHub sync finishes for a candidate without skills, skills are derived from repositories as `evidence`,
  `observed` or `insufficient`, never `confirmed`: a technology in a repository is not proof of personal skill or
  level.
- FSP is optional. The demo IDs `FSP-DEMO-024` and `FSP-DEMO-031` yield verified participation in a synthetic
  competition; any other ID connects with no history, which is a valid state. Only verified participation counts
  for the FSP filter and ranking.

### Skill states

| State | Label | Meaning |
| --- | --- | --- |
| `confirmed` | «Проверено» | Confirmed by a practical assessment; `evidenceGrade` is the assessed grade |
| `evidence` | «Есть свидетельства» | Source material shows use; the level is not checked |
| `observed` | «Найдено в работе» | The technology was found in a project; the level is not confirmed |
| `insufficient` | «Недостаточно данных» | No usable evidence; a data gap, not a verdict |

States are categories, not percentages. Each skill lists its evidence items (source `github`/`fsp`/`assessment`,
title, reference, date, individual or team scope, link). The candidate's graph is role → skills (`uses`) → evidence
(`supports`); the employer's graph of a candidate has no evidence nodes. The frontend draws server graphs as they
are.

## 4. Assessments

- Supported scope: backend, grades junior/middle/senior (`meta.assessmentPolicy.supportedScopes`). One task family,
  «Идемпотентное создание заказа» in Rust, with a variant per grade (`orders-<grade>-a`), four acceptance criteria and
  a shared rubric: Корректность (weight 4), Надёжность (3), Проверки (2), Объяснение решения (1).
- AI is allowed at every stage, including external tools; the candidate may mark `externalAiUsed`. Code is stored as
  text and never executed (`task.execution: "simulated"`).

### Eligibility

`assessmentEligibility` on the profile decides the primary action; the server repeats every check when an attempt
starts.

| Reason | When | Start error |
| --- | --- | --- |
| `onboarding_incomplete` | E-mail unverified, questionnaire incomplete or no processing consent | `409 onboarding_incomplete` |
| `active_assessment` | An attempt is `draft`, `in_progress`, `submitted` or `evaluating`; one active attempt at a time | `409 assessment_active` |
| `unsupported_scope` | The selected specialization is not backend | `422 assessment_scope_unavailable` |
| `grade_downgrade` | The target is below the verified grade in the same specialization; such attempts are never run | `422 grade_downgrade_forbidden` |
| `cooldown` | A grade-changing attempt within the cooldown after the last successful grade change | `409 grade_change_cooldown` |

The cooldown is 90 days by default (`FSP_GRADE_CHANGE_COOLDOWN_DAYS`, 0–365) and counts from `gradeConfirmedAt`;
`nextEligibleAt` tells when it ends. A retry at the already verified grade is allowed during the cooldown.
`canStartSelected` answers for the saved target, `canStartUpgrade` for any grade-changing attempt.

### Attempt lifecycle

`draft` → (answer saved) `in_progress` → (submitted) `submitted` → `evaluating` → `passed` | `failed` |
`service_error`.

- Only `draft` and `in_progress` attempts are editable (`409 assessment_not_editable`). Submission needs non-empty
  code and explanation (`422 answer_incomplete`) and makes the attempt immutable; another try is a new attempt.
- Checks run as a job against the current answer revision. If the answer changes before the job finishes, the job
  fails with `stale_input` and writes nothing. Each criterion is `passed`, `failed` or `not_run`.
- The assistant returns a prepared answer marked as simulated; no model is called.

### Outcomes

In the mock the outcome comes from the scenario (`baseline`/`qualified` pass, `assessment_failure` fails,
`service_failure` is a service error), not from the submitted code.

| Outcome | Effect |
| --- | --- |
| `passed` | The verified specialization and grade become the assessed ones (when there were none, the specialization differs, or the grade is not lower). `gradeConfirmedAt`, and with it the cooldown, moves only when the grade actually changed. Rust and PostgreSQL become `confirmed` at the assessed grade with an assessment evidence item appended; earlier evidence and other skills stay. |
| `failed` | The verified grade stays; rubric criteria are partial or not met; no cooldown is added. |
| `service_error` | No rubric, the grade stays, no cooldown; the job fails as `assessment_service_unavailable` (retryable) and a new attempt can start at once. |

A result records `outcome`, `previousGrade`, `confirmedGrade`, `gradeChanged`, rubric outcomes, checks, feedback and
`nextEligibleAt`. The history lists every attempt, newest first, and results never change afterwards.

## 5. Company

The company profile holds `displayName`, `businessArea`, `description`, `contactEmail` and an optional `website`.
It is `readyToInvite` when the first four are filled. Search and needs work without it, but sending an invitation
requires it (`422 company_incomplete`) and a verified employer e-mail (`403 email_not_verified`). There is no company
verification or «verified» badge.

## 6. Needs

- A need has a title, specialization, grade, work mode (`remote`/`hybrid`/`office`), salary, description and 1–5
  requirements. Each requirement has a skill, criticality (`required`/`desired`), a minimum grade and an evidence
  policy.
- Salary is a whole-ruble range from 1 to 100 000 000 with `currency: RUB`, `period: month`, `taxBasis: gross`
  («До вычета налогов»); currency, period and tax basis are fixed, not chosen.
- The evidence policy accepts any of practical assessments, GitHub work and FSP competitions; for FSP either
  `system` (any catalog competition that covers the skill) or `selected` (listed competition IDs).
- Validation on create, update and again when an invitation is sent (all `422`): `from ≤ to`
  (`salary_range_invalid`), unique skills (`duplicate_skill`), at least one required skill
  (`required_skill_missing`), at least one accepted source per requirement (`empty_evidence_policy`), known
  competitions (`unknown_competition`), an empty list with `system` (`ambiguous_competition_policy`), at least one
  competition with `selected` (`competition_required`).
- Needs are never published (`published: false`); invitations do not need a vacancy. Deleting or editing a need
  does not change invitations already sent.

## 7. Search and matching

- The bank contains only profiles visible to employers (section 2).
- **Recommended** mode needs a need of the company (`422 need_required`) and keeps candidates whose verified
  specialization equals the need's and whose verified grade is at least the need's. **Bank** mode shows everyone
  visible.
- Filters: verified specialization, exact verified grade, a skill in any state except `insufficient`, and verified FSP
  participation. Pages of 1–50 (default 10).

### Requirement result

| Status | Label | Rule |
| --- | --- | --- |
| `meets` | «Подтверждено» | The skill is `confirmed` by an assessment, the policy accepts assessments, and `evidenceGrade` ≥ the minimum grade |
| `not_evidenced` | «Недостаточно данных» | No skill or `insufficient` |
| `needs_verification` | «Есть основания, нужна проверка» | Any other case: evidence or observation only, a lower confirmed grade, or a confirmation the policy does not accept |

Only an assessment confirmation satisfies a requirement. GitHub work or FSP participation never does on its own,
even when the policy accepts those sources; they feed the gap plan instead.

A candidate is `missing_required` («Не хватает свидетельств по обязательным требованиям») when any required item is
`not_evidenced`, `meets_required` («Подходят по обязательным требованиям») when every required item meets and the
grade fits (same verified specialization, grade at least the need's), otherwise `needs_verification` («Требуют
дополнительной проверки»). Desired items never compensate for a missing required one. The result carries counts, the
per-requirement reasons, a sentence of explanation and `algorithmVersion: fixture-rules-v1`.

### Order

The server sorts; the UI groups by match status and says that the order is set by the server and is not a
probability of being hired.

- With a need: grade fit, required items met, desired items met, verified FSP participation, candidate ID.
- Without a need: verified specialization, verified grade (higher first), verified FSP participation, candidate ID.

FSP participation only breaks ties; its absence never disqualifies.

### Anonymous projection

Every employer response about a candidate (search, profile, graph) contains only: ID, alias, verified specialization
and grade with confirmation date, work modes, `availableForOffers`, skills (state, evidence grade, source kinds,
summary, evidence count, confirmation date — no evidence items), source kinds, verified FSP flag and the match. It
never contains a name, e-mail, handles, repository names, links or evidence titles. A profile that is not visible
answers `404`.

### Gap plan

For a need, each requirement that does not meet gets an action: a practical assessment when the policy accepts
assessments (`assessmentAvailable` is true only for backend needs), otherwise «provide accepted evidence», plus the
accepted catalog competitions when the policy accepts FSP. Employers get it for any visible candidate and their own need. Candidates get it only for
needs from their own invitations, built from the invitation's snapshot, so other needs cannot be read by guessing
IDs.

## 8. Shortlists

- Shortlists belong to a company and have a title (1–120 characters). Membership is a separate resource: adding
  requires a visible candidate, removing always works, and search filters or paging never change it.
- A member who is no longer visible stays in the list with `available: false` («Профиль недоступен»). Deleting a
  shortlist does not touch the bank.
- The UI adds and removes optimistically, rolls back if the server rejects, and updates every place that shows the
  membership.

## 9. Invitations

- **Create** (employer): a ready company, a verified employer e-mail, a valid need of the company, a visible
  candidate, a message of 1–4000 characters and an `Idempotency-Key`. There can be only one active (`sent`, `viewed`
  or `accepted`) invitation per company, candidate and need (`409 invitation_exists`).
- The invitation freezes a snapshot of the company (name, business area, description, contact e-mail) and of the
  need's terms (title, work mode, salary, description). The candidate sees the salary, the company and its contact
  before deciding.
- **Lifecycle:** `sent` → `viewed` (the candidate opens it; an explicit call, only from `sent`) → `accepted` or
  `declined`; the employer may withdraw a `sent` or `viewed` invitation. `accepted`, `declined` and `withdrawn` are
  terminal: a different action answers `409 invitation_terminal`, repeating the same one returns the record unchanged.
- **Accept:** the candidate picks at least one of name, e-mail and source links (the UI preselects name and e-mail);
  a verified candidate e-mail is required. Declining and withdrawing grant nothing.

## 10. Contact disclosure

Contacts are a separate resource per company (`GET /api/v1/candidates/{id}/disclosure`): `granted: false` with no
fields, or the fields the candidate chose (name, e-mail, repository links from connected sources) with the invitation
ID and time. Only the invitation's company gets the grant; every other company keeps seeing the anonymous profile.
Search, profile and graph responses never include contacts, even after acceptance. There is no chat: the parties
contact each other directly, and the company's contact was visible from the start.

## 11. PDF profile

- **Export:** a real PDF of the current profile (PDFKit with an embedded Cyrillic font), file `fsp-profile.pdf`.
- **Import:** one `application/pdf` file up to 2 MiB with a valid signature and end marker starts a `profile_import`
  job; its preview is edited by the candidate and applied once with a confirmation (`409 import_not_ready`,
  `409 import_already_confirmed`). Import cannot change verified fields and needs processing consent. The mock does
  not read the file and returns a fixed preview marked `parser: fixture_preview`, with unknown experience left empty.

## 12. Background jobs

Four kinds: `profile_import`, `source_sync`, `checks`, `assessment`. A job is `queued`, then `running` after about
300 ms and `succeeded` or `failed` after about one second; `pollAfterMs` tells clients when to ask again. A job is
visible only to the actor who started it, and a failure carries `{ code, message, retryable }`. Jobs live in memory,
so a restart clears them.

## 13. Capabilities and simulation

`GET /api/v1/meta` reports `mode: mock` and the capabilities: e-mail verification, PDF profile, GitHub and FSP
fixtures, matching and direct invitations are on; vacancy publication, self-application, chat, recurring tasks, real
code execution and real LLM are off. The UI shows no controls for capabilities that are off, labels simulated data,
and offers the «Демо» dialog while the server reports `mode: mock`.

Simulated today: e-mail delivery (fixed code `123456` in a demo mailbox), GitHub and FSP data, PDF parsing,
assessment checks and evaluation, the assistant, and the candidate bank. Session and access rules are implemented in
the mock but are not production security. Making these real is backend work.
