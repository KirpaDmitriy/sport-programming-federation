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
3. **Assessment integrity** — current preview already contains passed checks, check runs always pass and
   every nonempty submission certifies its target grade. Establish a versioned executable task and isolated
   runner with deterministic checks before calling this real grading. A model suggestion cannot establish
   grade validity. Preserve existing demo records as historical simulations; do not silently relabel them.
   Review task coverage and grade criteria before production qualification claims.
4. **External identity/evidence** — email delivery requires an actual sender/provider; GitHub OAuth already
   has an adapter but lacks app credentials; FSP has only a synthetic adapter and no supplied official API
   specification. Resolve those exact setup requirements with the user. No invented API or silent fixture
   fallback. Never place credentials in source/chat or use unrelated infrastructure.
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
- External integration setup question pending; PDF/assistant work can proceed independently.
