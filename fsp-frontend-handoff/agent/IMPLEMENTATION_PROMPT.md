# Implementation task

Implement the FSP reverse-hiring frontend from this handoff package. This document does not depend on a particular model API or proprietary tool.

The product lets an IT candidate establish a verified specialization/grade, enrich an evidence profile from external sources, and receive a salary-bearing invitation from an employer. Employers define needs, inspect an anonymous categorized bank, understand the matching reasons, preserve shortlists, and initiate contact. Build a functional React frontend against the included HTTP mock and the proposed Rust integration contract.

## Start here

1. Read the destination repository's instructions and this package's `AGENTS.md`.
2. Read `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/PRODUCT_RULES.md`, `docs/MOCKUP_CORRECTIONS.md` and `docs/SCREEN_SPECIFICATION.md`.
3. Inspect all ten images listed in `mockups/manifest.json`. Open `mockups/index.html` for an ordered gallery.
4. Read `docs/FRONTEND_ARCHITECTURE.md`, `docs/STACK_RESEARCH.md`, `docs/API_INTEGRATION.md` and `docs/MOCK_SERVER.md`.
5. Inspect `contracts/openapi.json`, the fixtures, tests and `frontend-reference/`. Treat generated output as generated output, not a second editable source of truth.
6. Run the mock tests and a live HTTP request before starting the application. Confirm the actual tool versions and inspect the current repository rather than assuming it is still empty.

## Deliverable

Create a complete, cohesive frontend under `frontend/` in the team's modular repository. Use React, TypeScript, the TanStack ecosystem and clean FSD. It must cover the ten main screens plus the mandatory auxiliary flows described in the specification: email registration/verification, onboarding, assessment states/history, company profile, invitation lists and status changes, session expiry and permission failures.

Run against the included stateful mock server first. A later switch to Rust must preserve the application's transport boundary and request/response shapes. Do not implement the Rust backend or replace the mock with unrelated in-component objects. Do not call GitHub, FSP, Bifrost or any LLM from the browser.

All interface text is Russian. Use the supplied color/token foundation and image hierarchy. Convert repeated elements into actual accessible components. Use the text corrections instead of copying rendering artifacts from the images.

## Non-negotiable behavior

- The candidate's self-selected grade never becomes a verified employer category by editing the profile.
- An unsuccessful upgrade preserves the previous verified grade. Service failures preserve the attempt and allow a retry without a grading penalty.
- Candidate data without FSP history is fully supported. GitHub enrichment is automatic and its provenance is visible to the profile owner.
- Employers see an anonymous allowlisted projection until the candidate accepts an invitation. The server must not send hidden personal fields. Respect company-scoped disclosure and clear caches when switching identities.
- Employers initiate invitations with an offer description, company contact and explicit RUB salary range. Publication of a vacancy is not required.
- Candidate acceptance/decline and employer status tracking reflect server state. Repeated submission, withdrawn invitations and stale tabs are handled explicitly.
- Search filters and shortlists have independent state. Changing filters does not erase saved candidates.
- AI assistance is allowed in assessment stages, including external tools. The frontend displays the task, checks, explanation and result returned by the service; it does not evaluate qualifications locally.

## Work sequence

Follow the dependency order in `docs/IMPLEMENTATION_PLAN.md`. Implement one vertical slice at a time and make a small commit once it works. Start with session/roles and generated API access, then the candidate path, then the employer path, and finally the cross-role invitation flow. Maintain runnable code after each slice.

Use the API metadata/capabilities to omit unavailable optional features. Vacancy publication, self-application, recurring employer tasks, live ATS integration and in-app chat are not required for this core frontend delivery unless the current user explicitly expands the scope and the contract supports them.

Resolve ordinary implementation details autonomously. If a real incompatibility is found, reproduce it, make the smallest coherent fix and record the decision. If an endpoint requires a contract change, update the specification, mock, generated types, fixtures and tests together. Do not invent an undocumented endpoint just to make a page appear functional.

## Verification

Use `docs/ACCEPTANCE_TESTS.md` as the acceptance checklist. Verify the candidate and employer flows in separate browser contexts, including a second employer company for privacy checks. Confirm keyboard navigation, form errors, empty states, slow requests, 401/403/409/422 responses, failures of background jobs and refresh during an assessment.

Keep a distinction between:

- tests actually run against the included mock;
- frontend tests you implement and execute;
- backend integration checks awaiting the real Rust service;
- product quality claims that require labeled data or expert evaluation.

Do not report mock assertions as evidence of real hiring accuracy or AI grading quality.

## Completion report

Provide a short Russian summary for Данил and Дима, with exact start/build/test commands, the branch and granular commit list, implemented routes, tested scenarios, and any material remaining gap. Include screenshots of the implemented frontend and actual test output. Update documentation when implementation differs from this package.

Stop optional refactoring after the required flows, quality checks and documented integration boundary work. Deliver the usable frontend rather than a plan for another agent.
