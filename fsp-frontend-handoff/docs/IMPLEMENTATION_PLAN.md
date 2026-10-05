# Frontend implementation plan

This is the receiving agent's execution plan. It is not a claim that the React application already exists. Complete the required vertical slices before adding optional functionality.

## Repository placement

The team repository is modular: `backend/`, `frontend/`, `infra/`, `docs/`, experiments and tests. The intended backend is modular Rust with a hexagonal boundary. This package owns the frontend handoff and a disposable development mock. Keep shared OpenAPI material in the agreed contract directory and coordinate any contract change with the backend workstream.

Work on the team's named feature branch, merge through `dev`, and preserve the existing `main` deployment convention. Inspect the real repository state before creating directories or applying files. Do not assume the repository is still empty, erase someone else's work or manufacture a commit history.

## Milestones and suggested commits

| Stage | Scope | Exit evidence | Suggested commit |
| --- | --- | --- | --- |
| 1 | Verify the handoff, install the pinned tools, start the mock and check the contract | Mock suite and a live HTTP response work locally | `chore(frontend): establish verified development baseline` |
| 2 | Vite/React/TypeScript application, FSD shell, semantic tokens, route skeleton, generated API client | Build and typecheck pass; deep links resolve; no duplicated DTOs | `feat(frontend): add app shell and typed API boundary` |
| 3 | Email challenge, verification, session bootstrap, role guards, logout, company separation | Candidate and employer contexts remain isolated; expired sessions recover | `feat(auth): implement verified email and role sessions` |
| 4 | Candidate onboarding, profile editing, import preview/confirmation and PDF export | Questionnaire complete; selected grade stays distinct from verified grade | `feat(candidate): implement profile and onboarding` |
| 5 | Automatic source status, evidence list/graph and target-level gap view | Coverage counts, no-FSP state and provenance work; keyboard list alternative exists | `feat(candidate): add sources and evidence explorer` |
| 6 | Assessment start, draft, checks, assistant, submission, result/history and eligibility | Refresh preserves server draft; failure preserves grade; service retry works | `feat(assessment): implement verified qualification flow` |
| 7 | Company profile and need editor, explicit salary and evidence policy | Invalid salary/empty contact blocked; unpublished need can initiate search | `feat(employer): implement company needs` |
| 8 | Search, recommendation reasons, anonymous profile and persistent shortlists | Search URL state works; membership persists and updates everywhere | `feat(employer): add explainable candidate selection` |
| 9 | Employer invitation send/status and candidate view/accept/decline | Only the invited company receives selected contacts after acceptance | `feat(invitations): complete company-scoped contact flow` |
| 10 | Error, accessibility and visual consistency pass; browser acceptance tests; runbook | Required tests pass with real output and reviewed screenshots | `test(frontend): verify the reverse-hiring workflow` |

Split a stage further when the change cannot be reviewed coherently. Keep each commit runnable. Avoid a single “upload all” commit, empty commits or a large refactor mixed with unrelated features.

## Slice implementation pattern

For each stage, read its screen specification and the relevant OpenAPI operations. Add or update the generated SDK only through the generator. Implement the entity query/mutation boundary, compose the page from smaller components, and cover its decisive success/error behavior. Inspect the rendered UI before committing.

Server data belongs in TanStack Query. Keep search filters in validated Router search parameters, form drafts in Form/local component state, and persisted server drafts behind API mutations. Use a small number of targeted invalidations after mutations. Do not invalidate the entire cache after every keystroke.

The candidate and employer pages may share semantic UI components, but their data projections remain distinct. A component accepting a private candidate DTO must not be reused for the anonymous employer profile through a boolean `hideContacts` flag.

## First usable demo

Before polishing every auxiliary page, make the complete core loop usable:

1. New candidate verifies email and completes the questionnaire.
2. Candidate takes a mock assessment and receives a verified category.
3. Employer creates a need with salary and company contact.
4. Employer finds the eligible candidate, sees the reasons and saves them.
5. Employer sends an invitation without publishing a vacancy.
6. Candidate opens the invitation and accepts with selected disclosure fields.
7. Inviting employer sees the allowed contact fields; a second company still cannot.

Then complete the failure paths, imports, graph, history and visual details. This sequence keeps the product's defining behavior testable throughout development.

## Deferred capabilities

Published vacancies/self-application, recurring short tasks, ATS integration, live FSP registration, employer moderation and chat are outside the core HTTP mock. Keep their controls hidden while the capability is disabled. Do not implement an isolated decorative page that cannot complete its action.

## Backend handover

Before switching the frontend to Rust, run the same transport conformance and browser acceptance cases against the Rust deployment. Check auth cookies, errors, dates, enum handling, nullability, pagination, access projections and asynchronous job behavior. Move secrets and source integrations to backend configuration. Production routing must exclude `/__mock__`.

When the Rust API differs, make one explicit contract migration. Update the specification, generated client, server fixtures and tests in the same change. Do not preserve two silently divergent API dialects.

## Final report from the implementing agent

Record the checked commit, dependency lockfile, actual toolchain, exact commands, test results, verified browser/viewport combinations, implemented routes, unresolved issues and any contract changes. Include screenshots of the implemented application, not only the reference PNGs. Keep the user summary in Russian and technical artifacts in English.
