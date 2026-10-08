# Real feature completion plan

Baseline: live release `bf85cc4` (2026-10-08), issue #31. Backend ownership coordination is approved.
The source code is the behavior reference. A configured integration is not proof of successful execution.

## Inspected gaps and delivery order

1. **PDF import** — `http::import_profile` discards validated bytes; `PlatformService::import_profile`
   returns a fixed identity. Replace this with an injected PDF extraction adapter, bounded isolated process,
   structured Bifrost extraction and verified page excerpts. Unknown values preserve the existing profile;
   the preview remains editable and confirmation is explicit. Reject stale previews and revoked consent.
   Expose corrupt/encrypted/image-only/oversized input failures without mutating the profile. Verify real
   exported PDFs, unrelated resume text, bogus model citations, parser limits and confirmation races.
2. **Assessment assistance** — the handler ignores the question and returns a canned reply. Send the saved
   answer, task and question through the existing gateway, validate bounded text, and check consent/state
   again after I/O. Make the UI describe actual assistant capability independently of simulated assessment
   execution. Preserve questions on failure and prevent overlapping requests. Prove the live model call.
3. **Knowledge tests** — the user prefers tests with answer choices and practical situations instead of writing
   and executing code. Replace new attempts with versioned questionnaires, server-held correct answers and
   deterministic scoring. Keep historical code attempts identifiable; no arbitrary nonempty submission passes.
   Define coverage and threshold per tested skill, preserve confirmed grades on failure, and explain that the
   result measures knowledge on this test rather than practical coding experience. Review answer quality and
   ambiguous questions against primary Rust/PostgreSQL sources; no model-only pass/fail decisions.
4. **FSP simulator** — the user explicitly requests a realistic mock HTTP service, not a real federation
   integration. Model participants, event discipline, individual/team results, protocol provenance and status
   using public federation materials; all people/results remain fictional and explicitly synthetic. Do not
   equate a team placement or identity link with individual skill qualification. Email and GitHub OAuth are
   explicitly postponed by the user and are outside this implementation wave.
5. **Verification and release** — contract/mock/generated frontend stay aligned; run relevant Rust/Postgres,
   TypeScript/component and browser tests; deliver atomic implementation/docs/memory commits through the
   checked feature -> danil -> dev -> main cascade. Check the changed live surfaces and logs independently,
   then synchronize mirror/local/server state and update this plan with evidence and remaining blockers.

## Design checks from primary sources

- [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): validate
  authorization and content, limit sizes including extracted output, and restrict parser privileges.
- [Bubblewrap](https://github.com/containers/bubblewrap): isolation depends on explicit namespace, mount and
  environment policy. Use an empty root, read-only runtime, no host secrets/network and bounded resources;
  fail closed when the sandbox cannot start. Never fall back to an unsandboxed parser.
- [gVisor security model](https://gvisor.dev/docs/architecture_guide/security/): arbitrary code needs a stronger
  execution boundary and explicit resource limits. Do not run candidate code in the API service.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): an available provider option,
  pending the user's existing provider/domain choice. No vendor integration is assumed configured.

Repository-pinned Rust/TypeScript/Bun versions remain authoritative. The team skill's generic Python/Taskiq
examples do not replace this project's Rust hexagonal architecture. PDF parsing stays outside the API process.

## Progress

- Source inspection and initial primary-source research complete.
- User confirmed: FSP stays simulated through a realistic mock server; email and GitHub OAuth are deferred.
- PDF/assistant wave committed; real local Rust/PostgreSQL + configured Bifrost browser checks passed
  for a cited PDF preview, confirmed profile fields and a contextual assistant reply.
- Knowledge-test wave implemented: 30 reviewed questions across three backend grades, deterministic scoring,
  private API answer key, archived legacy attempts, atomic draft/submission/consent ordering and result review.
  See [knowledge-tests.md](knowledge-tests.md) for thresholds, versioning and interpretation limits.
- FSP design checked against the federation's [2026 student event announcement](https://fsp-russia.ru/press/news/studencheskie-sorevnovaniya-po-sportivnomu-programmirovaniyu/):
  it distinguishes individual algorithmic/UAV events and product teams of 3–6 participants. This supports
  representing scope and team size, not inferring individual expertise from a team placement.
  Our HTTP schema is an invented demo boundary, not a discovered official federation API.
  Planned service: loopback-only versioned participant-results resource, explicit synthetic marker, fictional
  published/pending/empty records, bounded HTTP adapter and durable source snapshots. Only published records
  count as participation; neither registration nor participation assigns a grade. Resync must actually call the
  simulator rather than only update the timestamp. Additive storage plus deployment/rollback health checks
  keep existing data and releases compatible.
