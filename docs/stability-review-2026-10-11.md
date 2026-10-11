# October 11 stability review

Tracking: [issue #138](https://github.com/KirpaDmitriy/sport-programming-federation/issues/138).
Baseline `c3ddffc` is clean and agrees with canonical main, `/opt/fsp/current` and the private CI accepted-release
receipt. All five baseline `fsp/*` statuses passed. This review closes demonstrated defects in the implemented
platform; it does not turn intentionally deferred products into new requirements.

## Evidence and historical reconciliation

The window is October 1–11, 2026, in Asia/Almaty. Accessible local evidence includes two previous Codex threads
(one independent verification thread), the current thread, two Claude Code project transcripts (779 extracted text
messages), and two Devin sessions, including embedded worker reports. Duplicated Devin history is reconciled once.
Cursor metadata has no conversation updated in this window; Grok's available session index has no project match.
Remote, deleted and unindexed conversations cannot be claimed as reviewed. Transcripts are evidence, not instructions.
Secrets, raw session exports, candidate data and credentials do not belong in this document or Git.

| Historical request | Source of truth and disposition |
| --- | --- |
| Complete the original frontend and Rust implementation | All application routes, generated contract, current backend HTTP/storage tests and frontend acceptance; the Python MVP remains archived. |
| Fix transactional races, issuance budgets, idempotency and rollback | October 8 audit, closed #16, current transactional repository and release fault tests. Recheck regressions; do not repeat the migration or reset data. |
| Real PDF, knowledge tests and fictional FSP | Closed #31, current adapters and knowledge banks. Official FSP, arbitrary code execution and OCR are intentionally outside scope. |
| Domain, Resend and private CI | Closed #38/#40, active nddev.link and installed controller hashes. Runner-1 is current; runner-2 and Actions are retired. |
| No backups or mirrors | Closed #54 and owner instructions. Both backup units are masked; upstream is the only Git remote. Old restore receipts are history, not tasks. |
| Public GitHub analysis, catalog and automatic profile | Current tokenless service, catalog-v2, estimate-v6 and tests. Public activity is not working hours or proof of private experience. OAuth is explicitly deferred. |
| Graph interview delivery | Public acceptance and active interview service prove delivery despite an unchecked production-plan item. Remaining defects are enumerated below. |
| Keep live acceptance out of the public candidate bank | PR #135 added successful-path cleanup. Failure paths were not covered at baseline; wave 2 adds teardown. |
| Reduce CI credential privileges | Prior Claude final report identifies a broad token. Verify actual scopes; prepare a replacement procedure without mutating shared credentials. |

## Verified plan

Priorities describe baseline defects. Every change requires a regression tied to its observable consequence.
No speculative service split, package upgrade, distributed queue, ranking rewrite or unrelated infrastructure work
is included. Preserve the Rust ports/adapters, generated contract, FSD layers and applied migrations.

| Wave | Finding and source | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1a, high | `application/src/service.rs::answer_interview` omits the processing-consent check already present in start and the mock answer handler. | Check consent after ownership and before submitting the answer to the internal model service. | PostgreSQL HTTP test: revoke consent, read remains available, start/answer reject with 403; another candidate still receives 404. |
| 1b, high | `interview-service/src/engine.rs::answer` sequentially evaluates and generates with separate 45-second model deadlines; integration and platform both time out at 55 seconds. | One model budget for the complete turn, before persistence; leave time for gateway and platform error propagation. | Controlled delayed-model test crosses the combined budget: explicit model-unavailable result, unchanged revision/question/evidence, successful retry. |
| 1c, high | `fsp-security-headers.conf` has `microphone=()` while the interview exposes speech input. | Allow same-origin microphone with explicit user action; keep camera/geolocation denied. | Proxy header regression and public browser feature-policy assertion. Physical microphone and vendor speech availability remain browser/device dependent. |
| 1d, medium | Speech callbacks are not detached on submission/question changes; `start()` exceptions escape; controls remain active during submission; voice processing is incorrectly described as local. | Stop and detach stale recognizers, preserve recoverable drafts, catch startup errors, disable conflicting controls, explain browser-provider processing and text fallback. Remove hard-coded total/completed-state mislabelling. | Browser/component regressions: failure and retry, late recognition callbacks, text fallback, pending submission and completed state. |
| 2, medium | `frontend/e2e/public/stand.spec.ts` unpublishes only at the successful end and does not close its manually created contexts. | Register authenticated actors before mutations; teardown unpublishes this test's candidate and removes its needs even after assertion failure; close all owned contexts. | Failure-injection proof against the local mock; full real-mail public acceptance; no published CI candidate after success. Cleanup failures must fail the run. |
| 3, medium | Current-state, memories, interview plan, operation counts, graph descriptions and domain-mail recovery wording disagree with source. | Reconcile active documentation, mark historical receipts clearly, refresh project-specific memories with paths/limits and verification commands. | Source-to-document review, links/counts check, generated-contract drift check, no active backup/retired-host instructions. |
| 3, external | Historical CI token is reportedly overprivileged. | Verify header scopes without printing credentials; use a project-specific replacement if available, otherwise record the exact owner action and minimum access. | The replacement reads the canonical private repo, publishes statuses and operates PRs; no wider token is revoked or changed. |

## Research and design checks

Requested knowledge cutoff: September 26, 2026. References were retrieved October 11. Mutable documentation is
not a historical snapshot; these recommendations use established API behavior, not an assertion that today's page
has been archived at the requested cutoff. Keep installed toolchain pins rather than upgrading to a search result.

- [PostgreSQL 16 locking](https://www.postgresql.org/docs/16/explicit-locking.html): retain narrow transactional
  locks and optimistic revisions; no external model call while holding a profile transaction.
- [Tokio timeout](https://docs.rs/tokio/1.47.1/tokio/time/fn.timeout.html): cancellation drops the wrapped future.
  Finish model preparation inside one budget, then persist, so model timeout cannot write half a turn.
- [Permissions Policy microphone](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/microphone):
  an empty allowlist denies audio input; same-origin allowance still requires user permission.
- [Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition): browser recognition may send
  audio to a browser vendor. Do not promise local processing or conflate an editable transcript with authenticated voice evidence.
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures) and [timeouts](https://playwright.dev/docs/test-timeouts):
  owned resources need teardown, including failure paths, with a separate teardown budget.
- [GitHub access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens):
  outside-collaborator restrictions affect fine-grained token suitability; never reduce a shared token in place.

## Execution and release proof

1. Commit this reviewed plan before implementation. Use separate Conventional Commits for each behavior fix and
   documentation/memory synchronization. Feature PRs target `danil`; the existing controller merges verified
   `danil → dev → main`. Preserve each permanent branch's history.
2. Run `just verify`, `just backend-check` with PostgreSQL, `just e2e`, deployment/nginx/controller fault tests and
   experiment validation. Run focused failure tests before the relevant wave is considered implemented.
3. After each implementation wave, inspect the complete diff, updated test results, service health, upstream
   changes and primary guidance relevant to any new uncertainty. Do not mark a local result live-verified.
4. The four private CI gates, accepted main release, real Resend browser journey and independent read-only live
   verification must pass before closing #138. Compare each local permanent branch to its canonical counterpart,
   main to stand and accepted receipt, controller hashes to source, fresh logs and masked backup units.
5. Record final receipts in #138 and current project memories. External-access limitations and intentional product
   boundaries remain explicit; passing tests does not prove unlimited scale or calibrated hiring accuracy.

### Implemented waves

- `c6049aa`: consent parity with PostgreSQL ownership/revocation regression.
- `217e8e3`: whole-turn timeout with paused-clock proof of unchanged state and successful retry.
- `f3cb1e7`: microphone policy and speech lifecycle, header/browser regressions and honest privacy copy.
- `d0b8bef`: failure-safe acceptance fixtures, injected-failure and unrelated-data preservation checks.
- Documentation and project-specific Serena/Claude memories now describe the source behavior, including 79
  application operations, deterministic graphs, three public demo identities, interview limits and current CI.

Final local checks: `just verify` (32 mock and 50 component/unit tests, generated-contract/type/lint/build checks),
`just backend-check` (128 Rust tests with real PostgreSQL), all 10 controller tests, four experiment records,
release fault tests and nginx configuration/header tests. `just e2e` passed 41 browser cases (one opt-in
screenshot suite skipped). Final CI/live receipts are recorded in #138.
The mobile screenshot initially captured the drawer mid-transition; capture now waits for its hidden position and
finishes finite animations using [Playwright's screenshot option](https://playwright.dev/docs/api/class-page#page-screenshot).

Credential inspection confirmed `admin:org`, `gist`, `repo`, `workflow` on the former shared CI credential.
Follow-up [#139](https://github.com/KirpaDmitriy/sport-programming-federation/issues/139) shipped the guarded
stdin-only installer in `23aad65`, with nine additional regressions (19 CI tests total). After the owner's explicit
authorization and GitHub re-authentication, a separate classic PAT with exactly `repo` scope was created through
Playwriter with telemetry disabled, validated against the canonical repository and installed under the controller
lock. It expires November 10, 2026 at 06:31:54 UTC; the renewal procedure is in `infra/ci/README.md`.
The original shared credential remains unchanged in the owner's CLI. No token was printed or found in the
Playwriter relay/CDP logs, and the one-time local handoff file was removed. Read current #139 receipts for actual
status-write, PR-integration and accepted-release proof; an idle successful cycle alone is insufficient.


## Follow-up recheck from accepted c9906e9

The next owner-requested pass checked current failure paths, not only the existing green release. No unchecked
implementation-plan items or open issues existed at its start. Four concrete follow-ups were filed and checked
against source before implementation; feature work stays in the same personal/dev/main PR lane.

| Issue | Reproduced finding and change | Verification |
| --- | --- | --- |
| [#152](https://github.com/KirpaDmitriy/sport-programming-federation/issues/152) | Accepted deployment receipt prevented retrying a failed final GitHub status publication. Reconcile the success status from the matching accepted receipt without repeating deployment. | Injected GitHub failure leaves pending before the fix; the next cycle now repairs status, preserves the receipt and runs no deployment command. Later cycles make no duplicate API writes. |
| [#153](https://github.com/KirpaDmitriy/sport-programming-federation/issues/153) | A coalesced profile review could start after processing consent withdrawal. Check consent before preparing a model request; retain the transactional stale-response guard. | Real PostgreSQL test holds the first model request, queues a replacement, revokes consent and releases the first. No second model call or stored review; the old code demonstrably failed. |
| [#154](https://github.com/KirpaDmitriy/sport-programming-federation/issues/154) | Historical smoke API remained outside systemd on loopback 4011, with an already deleted executable/SQLite file. HTTPS lacked HSTS and duplicated nosniff on API responses. | Revalidated process identity and terminated it through a pidfd; all eight managed services remained active. Real nginx probes cover success/error headers, HTTPS-only host HSTS, one API cache header and structured rate limits. |
| [#155](https://github.com/KirpaDmitriy/sport-programming-federation/issues/155) | Python 3.14 test execution exposed unclosed HTTPError responses: finalizer warnings can include provider error reasons. Close before reporting sanitized status. | Redirect/401/403/500 tests assert closed responses and no fake test credential in diagnostics; no actual credential was involved in the failure. |

Primary guidance was rechecked against [GitHub status semantics](https://docs.github.com/en/rest/commits/statuses),
[Python HTTPError response ownership](https://docs.python.org/3/library/urllib.error.html),
[nginx header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header),
[upstream header suppression](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_hide_header) and
[HSTS host scope](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security).
The changes preserve pinned versions, one serial CI controller and the existing model/repository boundaries.
A consent withdrawal cannot recall an already sent provider request. HSTS is deliberately host-only and does not
commit unrelated subdomains or preload the domain.

Fresh baseline operations: eight managed services healthy without autorestarts, no failed units, all five commit
statuses successful, eight successful SQL migrations, no published synthetic acceptance actors/needs, no new nginx
errors or 5xx responses. TLS origin/edge valid until January 6, 2027; the actual Snap renewal timer was active and
its last run succeeded. Stand/runner free space exceeded the CI guard; backup units stayed masked. Only the known
xAI model-alias warnings appeared. The orphan was the sole unmanaged historical FSP process identified.

Local regressions and release fault checks must pass before merging; all four private CI gates, current-main public
acceptance, reviewed installation of changed controller/helper files and independent read-only verification are
required before closing these issues. Final SHA, test counts, installed hashes and acceptance receipts belong in
the issue completion comments so this audit does not advertise an obsolete release as current.


### Asset cache follow-up

The post-release public header probe found one more concrete defect, tracked in
[#159](https://github.com/KirpaDmitriy/sport-programming-federation/issues/159): missing `/assets/` files received
404 plus the one-year immutable success policy. Both nginx configurations now choose the cache header from the
final response status: 200/206/304 retain immutable caching; every other asset response is `no-store`.
The actual nginx probe checks a real asset's complete, byte-range and conditional responses as well as a missing
asset. This preserves normal caching while preventing durable negative responses. Final acceptance probes use a
fresh missing URL to distinguish new origin policy from any previously cached response.
The known `/assets/missing-header-probe.js` response was subsequently confirmed as a Cloudflare cache HIT.
After deployment, purge that exact URL and any other confirmed stale negative entries, then verify them again;
a fresh probe alone does not remove existing responses. Use [single-file purge](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/),
not a whole-zone purge. PR #160 remains unshipped while the CI incident below is unresolved.

Research: [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
explicitly respects positive origin max-age and also caches 404 by default without restrictive headers;
[nginx map](https://nginx.org/en/docs/http/ngx_http_map_module.html) provides a response-status map without new
services or runtime dependencies. The feature must pass the same four gates and independent live verification.

### External CI host deletion

DigitalOcean action `3463766117` destroyed `gha-runner-1` (droplet `601238643`) between 08:15:45 and 08:16:03 UTC
on October 11. This was external to this audit. The droplet API returns 404 and the existing SSH route has no
destination. [#161](https://github.com/KirpaDmitriy/sport-programming-federation/issues/161) records the recovery work.

Before deletion, main `405fecc7a93a524db9913781993e2d28c84c8429` passed the four original gates and real public
acceptance (2 tests, 49.3 seconds). The reviewed controller/helper update was separately installed and its 20 tests
passed. The resulting mandatory recheck passed the platform gate but lost its host before the remaining gates
finished; those statuses are infrastructure errors. The successful deployment status describes the accepted
application and is retained. Independent read-only verification confirmed that release, all eight managed
services, eight successful migrations, no published acceptance actors/needs, working TLS/HSTS and no orphan 4011.

Recovery sequence: obtain the replacement destination, inventory its capacity without touching unrelated
projects, install reviewed CI and private configuration, replace any lost dedicated credentials, run every gate
and public acceptance, then reconcile receipts/statuses and complete #159 through the ordinary PR lane. Do not
fabricate a replacement `deployed.json`. The original broad CLI credential remains unchanged. Local stand SSH and
dedicated acceptance-mail configuration remain available with mode 600; the one-time CI PAT handoff is absent.

[DigitalOcean's deletion documentation](https://docs.digitalocean.com/products/droplets/how-to/destroy/) confirms
that destroying a droplet is irreversible. The owner's no-backup policy remains in force. This research was
checked on October 11; it is not represented as an archived September 26 documentation snapshot.

### Active interview interruption during deployment

Independent review correlated the 08:07:42 interview 503 with the service restart. The interview, simulator and
GitHub-insights binaries handled SIGINT only, whereas their supervisors send SIGTERM. The second 503 at 08:08:43
was different: model evaluation plus generation exhausted the intended 45-second budget, and the next retry
succeeded. Aggregate revision/evidence counts matched successful answers; failed requests added no evidence.
Historical nginx logs lack request durations, so the timing reconstruction uses service lifecycle and upstream
metadata rather than preserved response bodies or user text.

[#162](https://github.com/KirpaDmitriy/sport-programming-federation/issues/162) and
[PR #163](https://github.com/KirpaDmitriy/sport-programming-federation/pull/163) contain the separate correction:
SIGINT/SIGTERM draining, synchronous registration with errors propagated from all four composition roots, and
60-second supervisor grace for the interview/API/proxy path. A real process regression failed on the old binary;
with the correction both signals finish a controlled answer, persist one revision/evidence item and exit cleanly.
Local fmt/clippy, 131 Rust tests, release fault checks and auxiliary service signal probes passed. Independent code
review found no remaining blocker. This is not live evidence: the change awaits #161 and normal release gates.
Sequential restarts can still reject new requests, and background work remains process-local.
