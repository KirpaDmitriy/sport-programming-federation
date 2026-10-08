# Operations and delivery

## Current Behavior

Only authorized stand: https://188.166.88.183. Private SSH state lives in the original checkout's `.fsp-infra/`.
Units: fsp-api on loopback 4010, fsp-simulator on loopback 4020, fsp-bifrost, fsp-cliproxy, nginx, postgresql@16-main. `/health` is unversioned.
The selected API is rust; no mock reset is part of deployment. Full-SHA immutable releases use a host lock,
nginx validation and recovery of previous release/config/service. Same-SHA replay checks health without restart.

Canonical repository: KirpaDmitriy/sport-programming-federation (upstream); origin is the rldyourmnd mirror.
Feature → personal danil/dima → dev → main; cascade waits for platform/backend/Docker/infra success and matches
PR head before merging. Main deployment gates its exact SHA. Never force permanent branches to one common SHA.

Daily postgres backup timer at 02:30 UTC + up to 15 minutes, persistent catch-up; private atomic custom archives
under /var/backups/fsp, retained for 14 days after successful backup. Real restore was proved in an isolated DB.

FSP releases install both Rust binaries and the private simulator unit, gate API activation on combined health,
and restore previous units on failure. Legacy release rollback without the helper stops it. Migration 0004 is additive.
PDF opt-in FSP_PDF_IMPORT=1 needs Bifrost, bubblewrap/poppler and the Ubuntu executable AppArmor profile.
Provisioning installs the profile; startup probes the actual isolated parser. Never disable global sandbox restrictions.
Default Docker PDF import is off; no privileged container is required for the ordinary platform/FSP service.

## Known Gaps

Local backups do not survive loss of the droplet. A verified pre-release archive was copied to the original
checkout's private `.fsp-infra/backups/`; off-host scheduling and retention are not automated. Shell recovery cannot
handle SIGKILL/power loss and binary rollback does not reverse schema changes. Applied migrations are immutable.
GitHub OAuth is disabled; LLM chain OAuth tokens can expire/rotate. Never print credentials or auth state.
No OpenObserve deployment exists in this project; verification uses systemd/nginx logs and direct response bodies.

Last commit: 6590b5a (FSP runtime and legacy rollback; exact release evidence is in issue #31).
