# Project handoff

## Current law

Read AGENTS.md and subtree rules. Code is authoritative. English engineering text, Russian UI, pinned Rust/TS7/Bun.
Backend changes in this audit were coordinated with Dima and explicitly authorized. Do not reset stand data,
rotate credentials, create another droplet or touch unrelated hosts. Preserve the no-attribution preference.
Feature -> danil -> dev -> main requires green checks; upstream is KirpaDmitriy, origin is the rldyourmnd mirror.

## Implemented

Earlier stabilization/browser/deadline work is recorded in closed issues #16, #23 and #27. Do not repeat it from
old transcripts. Active delivery ledger: [issue #31](https://github.com/KirpaDmitriy/sport-programming-federation/issues/31).

- 1b97338: real isolated digital-PDF extraction, validated/cited Bifrost fields, revision-safe confirmation and contextual assistance.
- 8e0a6c1: immutable knowledge-v1 tests, deterministic scoring, grade/consent/response atomicity, legacy archives and Russian UI.
- 6590b5a: separate fictional FSP HTTP provider, validated durable results, preserved snapshots on failure, private runtime and rollback.
- 89f0a2b: browser helper waits for the questionnaire and result headings/checks wrap on mobile.
- f1b4608: consistent knowledge-test vocabulary in candidate/employer evidence and vacancy flows.
- a8fc70a: readable mobile criteria and truthful legacy-result presentation.
- beb44d9: real successful PDF probe under exact systemd restrictions; no unused proc mount; runtime before migrations.
- 2f110cc: future additive migration support with strict history validation; guarded activation and historical-archive rejection.
- Documentation/knowledge follow-ups reconcile current rules, architecture, runbooks and screenshots.

## Verification and delivery

Local TypeScript/mock/component/build and Rust workspace gates passed. Browser review used the actual local
Rust API, isolated PostgreSQL and configured live Bifrost: cited PDF confirmation, real assistance, passing and
failing knowledge tests, draft reload, mobile results, FSP HTTP published/pending/empty and outage/recovery.
Release fault tests cover simulator outage, helper lifecycle, schema-compatible rollback, rejected old archives,
staged-script relocation and PDF preflight failure. Rust workspace now passes 63 tests, fmt and clippy.
A temporary fixed binary extracted a real PDF under exact stand systemd restrictions on October 8 at 03:47 UTC.
The first deployment 954be581 had exposed a proc-mount failure plus SQLx rejection of a future migration during
rollback; recovery retained all data and served 954be581 with PDF disabled. Do not mistake this historical
recovery state for final verification. The follow-up release must enable PDF only after its exact binary probe;
then repeat live browser proof and independent review before closing issue #31. Two final browser-test
failures were traced to stale FSP copy and the helper matching an outgoing form, then corrected.

Read issue #31 before resuming: it records final browser/CI results, PR/cascade/deployment SHA, independent live
verification and canonical/mirror/local/stand synchronization. If still open, complete unchecked delivery steps.
The issue closes only after these checks; local success never implies deployment. Private browser traces and
reports live under the original checkout's ignored .fsp-infra/. No production reset is a verification step.

## Scope and remaining limits

The user explicitly chose knowledge tests instead of a code executor, a fictional HTTP FSP provider instead of
an official federation integration, and deferred email/GitHub OAuth setup. None requires another approval now.
The public study bank is not leak-resistant or professionally calibrated; passing proves these test answers,
not practical work. OCR, durable background workers, measured large-bank scaling, off-host backup automation
and production identity assurance are not claimed implemented.

History audit covered current Codex, one Claude transcript and two Devin sessions in the available ten-day window.
Grok/Cursor indexes had no local project match; remote/deleted history was unavailable. Original session logs
remain intact. Update current project memories without overwriting user preferences or historical evidence.
