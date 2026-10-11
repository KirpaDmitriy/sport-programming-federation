# Project handoff

Read AGENTS.md, docs/current-state.md and the domain memories. Code and current release receipts override
historical transcripts. Engineering text is English; UI is Russian. Never expose secrets, rewrite shared history,
reset production data, create backups/snapshots or synchronize the retired GitHub mirror.

## Active release

PR #172 consolidates atomic feature histories for #159/#160 (asset errors), #162/#163 (graceful shutdown),
#167/#169 (matching and access), #168/#170 (Grok budgets), #166/#171 (private observability and masked replay),
and Dima's current main. Use normal feature -> danil -> dev -> main PRs, four actual fsp/* gates, unchanged-tree
merge guards and real public/mail acceptance. Close issues only after live verification.

The old CI runner was externally deleted. Amsterdam now has the reviewed FSP CI user/tooling. A bounded
operator bridge uses existing GitHub CLI authentication without copying a token into test jobs; the timer remains
disabled. Ubuntu SSH troubleshooting was stopped at the owner's request. Do not ask for the same host/key commands
again or claim unattended Ubuntu CI restored. #161 records the distinction and private evidence locations.

## Verify the current state

1. Fetch canonical upstream; compare each permanent local branch to its corresponding remote, preserving history.
2. Compare upstream/main, /opt/fsp/current on nddev.link's origin, /var/lib/fsp-ci/deployed.json on Amsterdam and
   the four build statuses plus fsp/deployment. Never synthesize an accepted receipt from a historical SHA.
3. Check API/interview/simulator/insights/LLM/nginx/PostgreSQL and OpenObserve/Vector units, public health and logs.
4. Run actual public browser/mail acceptance and a read-only independent verification of changed surfaces.
5. After the asset policy release, purge only /assets/missing-header-probe.js in Cloudflare and prove both that URL
   and a fresh missing asset return no-store. Keep backup units masked.

## Implementation pointers and limits

- Matching is deterministic-rules-v2, with confirmed requirements separate from accepted source observations.
  Both roles use the same score before pagination; private applicants remain company-scoped until withdrawal.
- Grok interactive/interview effort defaults to low, background profile review to medium. See docs/ai-latency.md
  for synthetic timing and quality differences; no p95 or accuracy-equivalence claim. LLM output never certifies grades.
- OpenObserve 1.0.4/Vector 0.59.0 are private native support services. The dashboard has nine verified queries.
  Browser replay masks all text/inputs and excludes sensitive or unsafe URLs. Logs exclude bodies/prompts/secrets.
  Run infra/observability/verify.py and verify_intake.py; public acceptance must prove RUM on the shipped release, separately from support-service health.
- GitHub OAuth is intentionally deferred; ownership uses a bio code. FSP is a labelled fictional provider.
  Knowledge tests are not calibrated practical qualifications. No OCR, durable job queue, measured load capacity,
  high availability, external alert delivery or OTLP span export is claimed.
- The lost dedicated CI PAT is not available merely because its historical expiry is in the future. Do not rotate
  or revoke the shared CLI credential. Restore unattended authentication separately if work resumes on #161.

Private operational data remains in the original ignored .fsp-infra and root-owned host configuration.
Domain memories: platform.md, frontend.md, operations.md. Runbooks and source are the current truth.
