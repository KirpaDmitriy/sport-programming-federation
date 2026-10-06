# Rust backend implementation checklist

This file records the requirements agreed with the product owner on 2026-10-06. It is the working checklist for
the backend cutover and must stay aligned with the delivered behavior.

## Boundaries

- [x] Implement the production backend in Rust using hexagonal architecture.
- [x] Preserve the current frontend structure and visual behavior.
- [x] Change frontend code only where its data source must move from mock-only endpoints or fixtures to `/api/v1`.
- [x] Keep synthetic demo users and FSP responses in backend adapters, clearly marked as synthetic.
- [x] Provide real registration, login, session, profile editing and persisted user data alongside demo data.
- [ ] Replace the Bun mock server on the deployed stand with the Rust backend.
- [ ] Preserve MetroGuard, its files, service, nginx configuration, certificates and port 8000.

## Contract and product behavior

- [ ] Implement the existing OpenAPI operations used by the frontend; do not redesign the frontend around a smaller API.
- [ ] Persist candidate and employer profiles, consents, needs, vacancies, applications, invitations, shortlists, tasks and assessments.
- [ ] Enforce role, ownership, contact disclosure and visibility rules on the server.
- [ ] Implement server-side pagination, filters and every sort exposed by the frontend.
- [x] Implement deterministic recommendations and explainable candidate ordering.
- [x] Serve candidate profile data from the backend; seeded profiles remain available as backend data.
- [x] Keep competence graphs as explicit placeholder data until an LLM provider is configured.

## GitHub source

- [x] Require an authenticated product session before connecting GitHub.
- [x] Support GitHub OAuth and store tokens outside domain entities.
- [x] Accept a GitHub username only after the account connection flow.
- [x] Download repository metadata through the GitHub API with bounded pagination and timeouts.
- [x] Calculate reproducible repository metrics without an LLM.
- [x] Expose source processing as a job with visible status and errors.

## FSP and LLM foundations

- [x] Provide a synthetic FSP adapter that implements the same application port as a future official adapter.
- [x] Keep a clear place for official FSP authentication and transport without coupling it to use cases.
- [x] Add a Bifrost outbound adapter for future repository analysis, competition matching and competence graph extraction.
- [x] Keep Bifrost disabled when it is not configured; return placeholder graph results explicitly rather than silently inventing analysis.
- [x] Define versioned structured LLM inputs and outputs with evidence references.

## Quality and delivery

- [ ] Add domain, application, adapter and HTTP contract tests for implemented behavior.
- [x] Preserve an offline CPU path for tests and the demo seed.
- [ ] Run `just backend-check`, relevant contract/frontend checks, Docker smoke and public stand smoke.
- [ ] Make granular commits on the named branch, merge through `dev`, then deploy `main`.
- [ ] Back up the old `/opt/kontur-talent` installation and database before cutover.
- [ ] Verify the public frontend against the Rust backend after deployment.
- [ ] Review comments and user-facing copy for unnecessary implementation language or generated filler.
