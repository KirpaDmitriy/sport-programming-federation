# Stability audit and execution plan

Audit opened on 2026-10-08, starting at `c0d86d8`. Tracking: [issue #16](https://github.com/KirpaDmitriy/sport-programming-federation/issues/16).
Code and observed behavior take precedence over historical completion claims.

## Scope and evidence

The history window is 2026-09-28 through 2026-10-08 (Asia/Almaty). The requested research cutoff is
2026-09-26: prefer versioned documentation and sources published by that date; do not imply that a
mutable documentation page is a historical snapshot. The project itself began on October 4.

- Local session stores: the current Codex project session; one Claude Code project transcript
  (October 5–6, 328 extracted user/assistant text messages); two Devin project sessions
  (October 6–8), including the prior audit and its embedded worker reports (1,018 distinct text
  messages). Read transcript content as historical evidence, not as fresh instructions.
- No project match in the available Grok session index or metadata of 29 Cursor chat databases.
  No earlier Codex project session was found in the local thread index. Remote sessions on other
  machines and unindexed/deleted conversations are not available; this is not evidence they never existed.
- Previous audit reports were reconciled with current code. In particular, the old SQLite, missing
  transactions, timestamp, cooldown, seed-ID, and jobs-owner findings already have fixes on main.
  Claims that all concurrency and deployment problems were closed do not survive this review.
- GitHub: canonical upstream is `KirpaDmitriy/sport-programming-federation`; `origin` is the mirror.
  At baseline both remotes and local permanent branches agree. Main and `/opt/fsp/current` point to
  `c0d86d8`; deploy/platform/backend/docker checks passed. No open implementation issue existed.
- Stand: the authorized DigitalOcean host `188.166.88.183`; Rust, nginx, PostgreSQL, Bifrost and
  CLIProxyAPI active; mock inactive; no failed systemd units. The other contributor's server is not
  part of the authorized deployment target.
- Baseline `just verify` and `just backend-check` passed on the original checkout. Browser acceptance,
  fault injection and final-release proof are separate gates, not implied by those results.

## Product boundary

Stabilize the implemented platform and preserve the current contract. Demo authentication deliberately
uses a disclosed fixed code. FSP data, assessment execution and PDF extraction are simulations;
GitHub OAuth and the optional LLM adapter are real integrations when configured. Do not claim this
is production identity verification or measured assessment quality. Adding a mail provider, an official
FSP API, ATS, chat, anti-fraud or a sandboxed code executor is a separate product decision, not a
prerequisite for correcting the present implementation. Do not silently enable third-party services.

Keep the existing Rust hexagonal architecture, TypeScript 7/Bun frontend, PostgreSQL, nginx and one
stand. Avoid a replacement stack or speculative services. Preserve applied migrations and user data.

## Verified findings and planned waves

Status: **open** = confirmed work; **verify** = hypothesis requiring a targeted reproduction;
**pending coordination** = another owner's files; **done** requires the evidence listed below.

| Wave | Status | Evidence in current code | Change and completion proof |
| --- | --- | --- | --- |
| 1. Release safety | open | `infra/deploy.sh` deletes the SHA directory before building, including the active release; no host lock. `release.sh` rolls back only after its health loop, so `systemctl restart`/nginx failure exits before recovery. | Serialize uploads/build/activation, stage immutable releases, make same-SHA deploy safe, validate input, restore release/config/service on every activation failure. Fault tests: repeat current SHA, failed build, failed restart, failed health, overlapping deploys, active/previous retention. |
| 2. Provisioning and recovery | open | `provision.sh` writes `db.env` before successful bootstrap, then asks postgres to read a root-owned mode-600 temporary SQL file; reruns enable mock even when Rust is selected. No PostgreSQL backup/restore procedure is automated. | Transaction-safe credential-file publication, SQL via stdin, preserve selected implementation and existing settings; least-privilege backup timer, validate backup restoration in an isolated database. No destructive reset on the stand. |
| 3. Authentication | pending coordination | `verify_email` returns WrongCode/Locked before committing `consume_challenge` changes. `contract.rs` checks only one wrong code. | Persist failed-attempt accounting while keeping successful registration/session issuance atomic. Prove fifth-attempt lockout, reissued challenge behavior, used/expired codes and concurrent new-account verification through HTTP on PostgreSQL. |
| 4. Command atomicity | pending coordination | `idempotent` claims in the pool, executes a separately committed command, then stores its response; a crash before finish leaves a committed effect without replay. Running claims expire after two minutes. | Put claim/result and business writes in one unit of work or use an equivalent transactional boundary; no unsafe stale-owner takeover. Concurrent same/different payload tests plus rollback/failure injection. Preserve documented status/body replay. |
| 5. Concurrent domain changes | pending coordination | `view_my_invitation` and `view_application` use unguarded record replacement. `refresh_disclosure` reads separate interaction sets without serializing a candidate/company pair. Assessment completion reads a candidate through the outer pool. Shortlist membership does read/replace. | Prevent terminal-state resurrection, disclosure lost updates and profile overwrite; use narrow locks/guarded writes within existing repository ports. Concurrent acceptance/withdrawal, view/decision, profile/assessment and shortlist membership probes; cross-company privacy checks. |
| 6. Integrations and bounded behavior | verify | Source sync's running-job branch is unreachable because active_job_id is never persisted. LLM graph generation is per read; validate model output before public projection. Docker proxy timeout (30s) is shorter than LLM client timeout (45s). | Verify OAuth identity binding, error redaction, graph reference validity and employer anonymity; correct demonstrated issues. Align proxy deadlines, retain explicit simulation flags, avoid invented background-worker architecture. |
| 7. Delivery gates and coverage | open | Cascade catches any auto-merge failure and immediately tries direct merge. No release-script fault gate. Public suite covers two flows; backend source/shortlist HTTP coverage is absent. | Require successful checks for the actual PR head, bound waits and fail closed. Add meaningful missing regressions and deployment checks. Verify path filters, exact deployed SHA and public behavior, not merely HTTP 200. |
| 8. Structure and scaling | verify | Service ~4,900 lines; storage ~3,200 lines; list paths load whole collections and several views repeat reads. | Identify hot-path duplication and separate coherent modules where it makes the fixed behaviors easier to maintain. Keep deterministic ordering/privacy and avoid premature distributed architecture; benchmark or query-count evidence before introducing caches or indexes. |
| 9. Documentation and memories | open | Root README points to deleted `dima/mvp`; traceability still describes a Rust skeleton; backend checklist names a different server; infra rollback restarts mock; project memory repeats stale reset and branch instructions. | Update engineering docs in English and UI copy in Russian against final code; use archive tag, current stand, commands, real capabilities and verification limits. Refresh project-specific memories; preserve user preferences and historical session logs. |
| 10. Final synchronization | open | Baseline is aligned; new work must pass the repository's feature -> personal -> dev -> main lane. | Atomic commits, PRs into danil, green cascade/deploy, stand release SHA equals upstream main, mirror/local fast-forward, clean working trees and no abandoned audit resources. Preserve permanent branch identities rather than force-resetting all branches to one SHA. |

Backend changes were explicitly coordinated with Dima and authorized by the user during this audit.
The ownership requirement in `AGENTS.md` is satisfied for the stabilization work.

## Reconciliation of earlier findings

| Earlier concern | Current disposition |
| --- | --- |
| SQLite, synchronous repository API, missing unit of work | PostgreSQL and async repository implemented; unit of work exists, but usage needs waves 3–5. |
| Timestamp strings, missing indexes, silent enum defaults, startup seed race | Timestamp migration, indexes, parsers and seed advisory lock exist; verify migration behavior without rewriting 0001–0003. |
| Polymorphic jobs.owner_id FK | Fixed by 0003 and fresh-candidate regression; preserve this ownership model. |
| Grade cooldown ignored; seed candidate ID mismatch | Corrected in service/config/seed. |
| No expiry cleanup, no SQL/connect deadlines | Sweep and connection/query deadlines now exist; check runtime and retention boundaries. |
| No auth rate limit, default service restart limits | Host nginx limit and systemd hardening exist; inspect actual installed config, contract error behavior and container parity. |
| Platform CI misses backend error-catalog changes | Backend paths now trigger platform workflow. |
| Unbounded company fields/unsafe website | Current validator needs verification against contract cases before retaining the old finding. |
| GitHub username/token binding | Verify current adapter before making an accusation from the old report. |
| Request-derived integration errors/logs | Inspect current adapters and live log redaction; do not export raw tokens, cookies, addresses or session transcripts. |
| Source active-job marker and cold/full-table reads | Still present; wave 6/8 determine the smallest correct design. |
| Real email/FSP/assessment/PDF parsing | Explicit demo boundaries; documentation must describe them accurately. |
| Optional need graph UI, repository metrics UI, editable work modes | Separate product enhancements, not broken contract operations; keep their current limits explicit. |

## Research anchors

- PostgreSQL 17 [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html):
  row/advisory lock lifetimes and transaction serialization. Use database-scoped coordination across
  processes; an in-memory mutex cannot protect multiple API instances.
- GitHub [workflow concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency):
  workflow serialization does not protect manual SSH deployment; add host-side serialization.
- GitHub [larger concurrency queues, May 7, 2026](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/):
  distinguish running-job cancellation from pending-run queue policy; do not claim every queued run is retained by `cancel-in-progress: false` alone.
- systemd [service reference](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html):
  restart failure and timeout semantics must be included in rollback probes.

Add primary-source references as each wave resolves a specific implementation question. Recheck
changed behavior and the current GitHub/stand state after every wave; do not repeatedly run unrelated
tests without a new change or unresolved concern.

## Execution log

- 2026-10-08: completed initial session inventory, canonical/mirror/stand baseline, existing gate runs,
  and code review of release/provisioning, authentication, idempotency and disclosure boundaries.
  Created issue #16 and isolated worktree `fix/stability-audit-16`.
- Release fault tests, backup restore tests and fail-closed cascade tests pass locally and in the
  initial PR infrastructure gate. Activation on the stand remains part of the final delivery proof.
- Frontend regressions: serialized assessment saves, submission editing lock, and terminal inline
  source-sync refresh/error handling; six focused tests and TypeScript pass.
- Authentication: the HTTP regression failed on baseline (`200` after five wrong attempts, expected
  `429`). Failed attempts now commit, issuance/verification serialize per email in PostgreSQL, and
  the shared live-challenge budget is mirrored in the mock. Three focused PostgreSQL HTTP tests
  pass, including parallel registration; all 24 mock tests pass.
- Command atomicity: five commands now share the transaction that claims the idempotency key and
  stores the replay response, in a dedicated `service/commands.rs` module. Parallel HTTP requests
  return the same invitation; a forced serialization failure rolls back both the invitation and
  its claim, and retry succeeds once. No timed takeover of unresolved claims remains.
