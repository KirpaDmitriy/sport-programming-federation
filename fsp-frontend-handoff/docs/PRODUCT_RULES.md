# Product rules and domain boundaries

Status: team design for the frontend MVP. Exact wire fields and enum values are defined by `../contracts/openapi.json`. The official requirements are in `../sources/organizer-spec.pdf`; requirement references use its printed page numbers.

## 1. Core product

An employer initiates contact with a categorized IT candidate and states the salary before contact disclosure. The primary loop is registration, questionnaire, grade assessment, assigned category, employer search and a personal invitation. Vacancy browsing and self-application are optional additions, not substitutes for this loop. See specification §2 and §2.1, printed pages 1–4.

The evidence graph extends this core. It gives the candidate and employer an understandable explanation of observed work, verified achievements, assessment results and remaining requirements. It does not replace mandatory assessment-based category assignment.

## 2. Authority and ownership

| Value | Authority | Frontend responsibility |
| --- | --- | --- |
| Name, contact fields, experience and desired role | Candidate input, subject to server validation | Edit and display the owner's values |
| Selected grade | Candidate | Present as an assessment target |
| Verified specialization/grade and employer-visible category | Assessment service/domain rules | Display the returned result and eligibility |
| External observation and attribution | Source connector with provenance | Display source, coverage, status and limitations |
| Confirmed achievement | Verified source record or assessment | Distinguish it from observation/self-report |
| Matching result and rank | Backend matcher | Display requirement-level reasons and gaps |
| Invitation status and contact grant | Backend with authenticated actor/tenant | Submit explicit actions and refetch affected views |
| Shortlist membership | Employer's persisted company data | Keep membership consistent across search and list views |

Browser inputs are not authoritative for grade, rank, candidate identity, tenant identity, evidence reliability or consent history.

## 3. Onboarding and category

Registration uses email verification, as required by §2.2, printed page 4. Passwordless email challenge/verification is the proposed implementation choice; the requirement does not mandate a password flow or Keycloak.

Collect industry, specialization, selected grade and the profile data specified by the organizer. The first employer-visible category requires the questionnaire and a passed assessment. A newcomer without a verified category sees their own pending state; the employer bank does not mislabel them as a verified specialist.

Changing the desired grade in the profile requests a new target. It never overwrites the existing verified grade. A failed attempt to reach Middle preserves Junior. The candidate may choose a lower target or later retry according to the eligibility returned by the API.

The team decision in this package is a **90-day interval after a successful grade change**. This is a configurable policy, not a fixed organizer requirement. The service returns the next eligible time and reason. A failed attempt does not reset this interval. A service/model failure is not an assessment failure and does not impose a grading penalty. See the mock's exact eligibility behavior before rendering actions.

## 4. Evidence and graph

Evidence states describe different claims:

- **Observed:** a technology or activity was found in work attributed to the connected account.
- **Evidence available:** relevant source material supports a competency but the target-level claim is not fully confirmed.
- **Confirmed:** the applicable assessment or accepted authoritative achievement supports the specific claim.
- **Insufficient:** the available information cannot support that claim.

These states are not interchangeable confidence percentages. Every assessment-derived claim includes its assessed specialization/grade and version. A passed Junior exercise can coexist with a Middle-level PostgreSQL gap.

Keep the source record, attributed contribution, inferred competency and assessment result distinct. A repository language list, a fork, a commit count or a popular project alone cannot establish personal competence. Working hours cannot be recovered reliably from GitHub activity; this product does not display inferred hours.

GitHub is the first external source. After account connection, discovery and analysis run automatically. The candidate can inspect provenance; the flow does not require them to manually curate or approve each repository. Report/disconnect controls remain absent until their handlers are contracted. Private repository ingestion is outside this mock boundary.

FSP ID is optional. The actual organizer specification explicitly supplies no FSP API, schema or dataset (§2, printed page 2; §4, page 6). The adapter shape and event records in this package are team proposals. Label synthetic source content in demonstrations. Absence of FSP history is a supported state, not a failed registration.

## 5. Need, matching and gaps

A need contains specialization, grade, work format, team/offer description, skills with criticality, and evidence policy. Distinguish required from desired competencies. An invitation can be created from a saved need without publication of a vacancy.

Search uses the verified category, authorized profile visibility and the employer's filters. Explain required matches separately from optional strengths and unknown evidence. A missing PostgreSQL confirmation does not mean that the candidate has no PostgreSQL skill; it means that the current accepted evidence does not establish that requirement.

The mock matcher is deterministic and exists to exercise the UI. Its output is not an empirically calibrated probability of success. It must distinguish satisfied requirements, requirements needing verification and absent/insufficient evidence. Within the applicable category and relevance group, confirmed test results and FSP achievements can improve ranking as required by §2.1, printed page 4. Do not promote an unverified self-description ahead of a verified category through a score.

The employer can choose acceptable evidence types and specific demo competitions through the agreed policy fields. Gap suggestions state why a task or event would address a requirement. Synthetic competitions are not presented as real upcoming events, and completing an event does not promise a job or automatically prove an unrelated skill.

Shortlists belong to a company and survive filter changes, navigation and data refetching. Search selection is not a substitute for persisted shortlist membership.

## 6. Salary and invitation

Salary is a required positive integer RUB range with minimum not greater than maximum. This contract supports monthly amounts before tax; show the tax basis as a read-only label, not a nonfunctional gross/net selector. Both the need/invitation form and the candidate's invitation view expose the same range. The demo is 200,000–260,000 RUB per month before tax.

An invitation includes the offer, salary, company name/description and employer contact. Those company details are visible to the candidate before accepting. Candidate acceptance is an explicit action; merely opening an invitation marks it viewed and does not grant contact access.

Use explicit transitions for sent, viewed, accepted, declined and withdrawn records, according to the contract. A stale or terminal record cannot be silently rewritten. Repeated identical invitation creation uses the contract's idempotency behavior. The interface must show the server's current state after conflict resolution.

Contact disclosure is a separate resource. It is granted only to the invitation's company, only after acceptance, and only for selected fields. The core demo opens name/email by default; source links are a separate choice. Another company retains the anonymous projection. Decline and withdrawal grant no access.

There is no in-app chat in the core contract. After acceptance, the employer uses the disclosed contacts to communicate directly. Do not show a nonfunctional message composer or promise that a chat will open.

## 7. Privacy and sessions

The candidate can access only their own profile, imports, jobs, evidence, assessments and invitations. The employer can manage only its company's needs, shortlists and invitations. Anonymous candidate access is still subject to eligibility and publication consent.

Before consent, employer responses must exclude names, personal contact fields, source handles, raw repository URLs, commit SHAs, identifiable code excerpts and personal initials. This is an API projection rule, not a visual blur. The detail inspector, graph, exports, cache and logs require the same boundary.

Separate processing consent from publication consent. Switching publication off removes the candidate from new bank/search exposure. Existing invitation records remain coherent; the exact lifetime/revocation behavior of existing disclosures is a backend/privacy decision and must not be invented by the frontend.

Use same-origin authenticated requests. Production cookie flags, CSRF protection, token storage, provider credentials, audit retention and the organizer's personal-data requirements remain backend/infrastructure obligations. The local mock does not establish production security or legal compliance.

## 8. Assessment and simulation limits

The proposed assessment approach uses task families, variants, explicit rubrics, deterministic checks and a follow-up change/explanation. AI assistance is permitted in every stage, including external tools. The evaluation concerns the delivered solution and its adaptation/explanation.

The frontend displays a task version, draft, checks, assistant exchange, submission status and result. Preserve drafts across refresh where the API supports it. Prevent accidental navigation loss and duplicate submissions. Poll asynchronous work until a terminal state and stop polling after logout, unmount or a terminal result.

The included mock never executes submitted code, evaluates a real model or analyzes live source repositories. It returns scenario-controlled results. Real task equivalence, resistance to leaked solutions, model grading reliability and ranking quality require independent validation data. Mock tests prove contract and state behavior only.

## 9. Optional capabilities

Core-disabled capabilities are published vacancies/self-application, recurring employer tasks, ATS integration, employer moderation and in-app chat. Their absence must not leave dead UI controls. Read the metadata/capabilities response and keep unsupported optional controls out of the primary workflow.

Desktop behavior is the organizer's baseline. The design includes adaptive guidance, but a complete mobile redesign is an optional extension. The presentation template's mandatory slides 7–11 and final submission requirements are preserved as source material; building the frontend does not itself complete the hackathon submission.
