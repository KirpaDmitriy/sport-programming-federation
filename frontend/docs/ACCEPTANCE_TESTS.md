# Frontend acceptance and integration tests

Status: implemented in `frontend/test` (Vitest + MSW) and `frontend/e2e` (Playwright against the mock); run commands and current results are in the [frontend README](../README.md). The separately included mock-server tests and package verification report describe what was actually run while preparing the handoff.

Use the real local HTTP mock for end-to-end flows. Use MSW for small deterministic component tests and failure injection. Do not run both handlers for the same request without an explicit test setup. Reset the HTTP mock between independent test cases and use separate browser contexts for different actors.

## Required functional cases

| ID | Scenario | Required assertion |
| --- | --- | --- |
| UI-01 | First candidate registration | Email must be verified before protected onboarding/assessment actions; incorrect and expired codes have recoverable errors |
| UI-02 | Questionnaire/profile | Industry, specialization and target grade are explicit; saving a target grade does not assign a verified category |
| UI-03 | Incomplete candidate | Employer search never presents an unverified target grade as a verified category |
| UI-04 | PDF import | File validation, upload, job state, parsed preview and explicit confirmation work; existing profile is not silently overwritten |
| UI-05 | PDF export | A real PDF is downloaded for the authenticated candidate; filename and content type are correct |
| UI-06 | GitHub enrichment | Source connection starts processing automatically; poll `Source.activeJobId`. Counts satisfy found = processed + queued + unavailable, including the initial 12/8/3/1 and completed 12/11/0/1 snapshots |
| UI-07 | Missing FSP | Candidate can complete the core flow without FSP history; no mandatory-ID validation appears |
| UI-08 | Evidence inspector | Selected graph node opens the correct claim/provenance; assessed grade and target grade are explicit |
| UI-09 | Graph accessibility | Every competency and evidence item is reachable through a keyboard-accessible list alternative |
| UI-10 | Assessment draft | Save, navigate away and reload; the server-backed draft is restored without creating another attempt |
| UI-11 | Assessment checks and assistant | Pending/error/success states are distinct; mock content is not described as actual execution or a live model response |
| UI-12 | Successful assessment | Category changes only after the successful server result; history and affected profile queries update |
| UI-13 | Failed upgrade | Existing verified grade is preserved; the page offers only currently eligible next actions |
| UI-14 | Service failure | The attempt remains retryable without a false failure result or grade penalty |
| UI-15 | Grade interval | API-provided next-eligible time controls the action; the browser does not enforce a different local policy |
| UI-16 | Company and need | Required offer, company contact and RUB min/max validation work; tax basis and monthly period are visible |
| UI-17 | Search/filter/navigation | Filters serialize to validated URL parameters; back/forward restores them; malformed values get safe defaults or clear errors |
| UI-18 | Explainable selection | Required matches and requirements needing evidence are distinct; a verified grade is not replaced by an individual-skill status |
| UI-19 | Persistent shortlist | Add candidate, change filters, navigate, refresh; membership persists and bookmark state agrees everywhere |
| UI-20 | Anonymous employer profile | DOM, network response, cache, tooltips, graph and source links contain no private candidate identity before consent |
| UI-21 | Direct invitation | Employer can invite from an unpublished need; salary and company contact appear before candidate acceptance |
| UI-22 | View and decline | Viewing changes only view status; decline creates no contact grant; both parties see the current status |
| UI-23 | Acceptance scope | Candidate opens selected name/email for company A; company A sees exactly those fields; company B still has no contact access |
| UI-24 | Stale/duplicate action | Double submit and terminal-state conflicts do not create duplicate invitations or override a withdrawn record; UI reconciles a 409 |
| UI-25 | Role and session separation | Candidate cannot inspect another candidate's private record; employer cannot mutate another company; logout/actor switch clears cached data |
| UI-26 | Disabled optional features | No dead publish, self-apply, recurring-task, chat or ATS control is visible while its capability is disabled |

## Required interaction states

Cover initial loading, background refresh, empty collection, offline/network error, validation errors, unauthenticated response, forbidden response, not found, conflict and service-unavailable response. Keep an already loaded list visible during a background refresh unless its authorization changes. Do not leave a stale private view visible after a session change.

For long-running imports, source syncs and assessments, verify polling starts and stops correctly, retry is deliberate, navigation does not create duplicate work, and terminal errors do not show a success notification. Test one delayed response and one failed response per job family.

Form submission must disable only the relevant pending action, preserve user input after recoverable failure, focus or associate the first validation error, and support keyboard submission. A server-side 422 is not replaced with an unrelated generic toast.

## Accessibility and visual checks

- Check the primary desktop layout at 1440×900 and a smaller desktop at 1280×800. Review the high-fidelity reference near its original 1586×992 proportions without forcing a fixed-width page.
- Check keyboard-only navigation, visible focus, dialog focus return, Escape behavior where appropriate and accessible names for icon-only actions.
- Use semantic headings, labels and table headers. State is communicated with text/icons as well as color.
- Verify normal text contrast and reduced-motion behavior. Automated accessibility checks supplement manual inspection.
- Review long names, translated labels, empty evidence, very long skill lists and salary formatting. Avoid truncated critical conditions and horizontal page overflow.
- For optional narrow layouts, turn side navigation into an accessible drawer and dense tables into an intentional scroll region or card presentation. Do not squeeze an IDE-like workspace into unreadable columns.

## Contract checks for the real Rust API

The frontend's successful run against a mock does not validate the production service. Before backend cutover, reuse the same tests for:

1. Every request/response shape and documented error envelope.
2. Authentication, cookie attributes, origin/CSRF handling and authorization.
3. Company/candidate scope for jobs, evidence, imports, needs, shortlists and invitations.
4. Contact disclosure and data minimization before/after acceptance.
5. Enum changes, UTC timestamps, nullable values, stable pagination and sorting.
6. Actual source errors, model timeouts, durable processing and assessment-result persistence.
7. Contracted state conflicts and idempotent command retries; add revision preconditions only if a later contract defines them.

Do not turn a conformance failure into an unchecked cast or `any`. Reconcile the contract and regenerate the SDK.

## Evidence to retain

Keep the command, runtime versions, commit identifier, machine-readable test results and relevant screenshots. Record skipped cases with a concrete reason. Track product validation separately: matching precision, assessment agreement, task-difficulty consistency and model robustness need their own labeled evaluation data and cannot be inferred from this UI suite.
