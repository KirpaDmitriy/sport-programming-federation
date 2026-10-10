# Current system state

Reviewed on 2026-10-08 against source, accepted release `cd44951`, private CI and the live stand.
Issue [#54](https://github.com/KirpaDmitriy/sport-programming-federation/issues/54) records the subsequent
owner no-backup/no-mirror policy and its final integrated SHA; #50 is the earlier consistency review. This page describes behavior; use the receipts below for the current
release identity instead of treating a SHA in historical documentation as the latest release.

## Implemented and verified

| Area | Current behavior | Source / proof |
| --- | --- | --- |
| Runtime | https://nddev.link; Rust API, PostgreSQL persistence, nginx, Cloudflare Full (strict), canonical IP redirect | [Infrastructure](../infra/README.md), real public browser acceptance |
| Authentication | Resend OTP mail, random six-digit codes, challenge/session HMAC separation, durable issuance/attempt limits, secure session cookies | [Email adapter](../backend/crates/integration-email/src/lib.rs), PostgreSQL HTTP regressions, owner real-mail login |
| Privacy and writes | Role/company scoping, anonymous candidate projections, selected disclosure, atomic idempotency, guarded terminal decisions | [Business rules](product/BUSINESS_RULES.md), Rust HTTP/storage and two-company browser scenarios |
| Assessment | Versioned knowledge questions (backend junior–senior, frontend junior/middle; balanced 5+5 variants per attempt), deterministic scoring, saved drafts, immutable results, preserved grade on failure | [Knowledge tests](knowledge-tests.md), component/HTTP/browser regressions |
| PDF and assistance | Actual bounded isolated text extraction and cited Bifrost import; contextual assistant and graphs call Bifrost | [Backend runtime](../backend/README.md#pdf-import-runtime), exact-systemd PDF probe, earlier live feature evidence in #31 |
| FSP | Separate private HTTP simulator with explicit fictional provenance and preserved snapshots on outage | [FSP simulator](fsp-simulator.md), HTTP and browser evidence |
| Delivery | Four private-server CI gates, checked personal → dev → main PRs, exact-main deployment and actual Resend browser acceptance | [CI runbook](../infra/ci/README.md); no GitHub Actions dependency |
| Recovery | Locked immutable releases, schema/runtime compatibility guards and tested activation rollback; backups disabled by owner policy | [Operations policy](../infra/README.md#backups-and-recovery), activation fault tests |

Capability flags report configuration, not external-provider health. The development HTTP mock and its
fixed-code accounts are a separate local mode; they do not prove live behavior. The public browser suite
uses actual Rust/PostgreSQL and real received email, creates fresh actors and never resets the stand.

## Explicit remaining limits

- GitHub OAuth setup is deferred by the owner. Official FSP integration and arbitrary candidate code execution
  are outside the chosen scope; the fictional provider and knowledge tests are intentional.
- The published study bank is not professionally calibrated or resistant to leaked answers. Results do not
  certify practical experience; LLM suggestions never decide grades.
- Digital PDFs only: OCR is unsupported. External mail/LLM providers can fail; failures remain visible.
- Source jobs finish inline; candidate ranking still reads collections in memory. There is no durable worker,
  measured large-bank/load capacity, high availability or comprehensive production security certification.
- Backups, snapshots and redundant repository mirrors are disabled by explicit owner policy. Existing backup
  archives were deleted; do not reintroduce them. There is no external alerting/APM deployment;
  operators inspect systemd/nginx and private CI logs.
- CI admits only trusted maintainers of the private repository. Docker access is root-equivalent. Repository
  branch protection is unavailable to this account, so maintainers must follow the documented PR gates.

These are the system's current boundaries, not claims that the omitted capabilities exist. New capacity or
product requirements need their own concrete acceptance criteria before changing the architecture.

## Verify release identity and health

1. Fetch canonical `upstream` and compare each permanent local branch with its corresponding canonical remote.
   The old GitHub mirror is retired and must not be updated.
   Preserve their distinct merge history; never reset all branches to a common SHA.
2. Compare `upstream/main`, `/opt/fsp/current` on the stand and
   `/var/lib/fsp-ci/deployed.json` on server-gha-runner-2. The accepted-release marker is written only after
   deployment and the real public browser journey pass; check `fsp/deployment` as well as the four build gates.
3. Inspect active API/simulator/LLM/nginx/PostgreSQL units, recent service/nginx errors, disk space, certificate
   renewal and confirm both `fsp-backup` units are masked/inactive. No public capability flag substitutes for a real integration check.
4. Use [TESTING.md](../frontend/docs/TESTING.md) for suites and private real-mail acceptance configuration.
   Preserve provider credentials, OTPs and cookies outside git; private evidence lives in `.fsp-infra/`.

Earlier delivery ledgers: #16 (stability), #23/#27 (live browser fixes), #31 (knowledge/PDF/FSP),
#38 (domain/mail), #40 (private CI). Their plans and screenshots are dated evidence; current source wins.
