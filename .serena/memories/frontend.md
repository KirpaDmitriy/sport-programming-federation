# Frontend behavior

React/strict TypeScript 7, FSD and generated contracts; Russian UI and server-owned grades/privacy/state.
Assessment draft saves queue; submission waits for acknowledgment and locks editing. Knowledge workspace uses
labelled radios and saved counts; failed tests preserve grades and final results explain knowledge-only scope.
PDF previews show cited excerpts; profile changes invalidate stale confirmation. FSP cards identify fictional
records and distinguish pending/empty/DQ/outage. Deferred GitHub OAuth has no active connect control.
Graph generation runs only in graph view; failures show explicit retry without stale success/fallback graphs.

Login uses capabilities.realEmail to hide seed-account/demo-code hints in Resend mode. It explains inbox/spam
checks and resend timing. Real codes never appear in a public development mailbox. Demo behavior is local only.
Required form labels include the required marker; browser tests locate their accessible role/name accordingly.
The onboarding browser helper waits for all questionnaire radios before selecting answers.

Mock E2E covers disclosed fixtures. Public E2E creates a candidate and two fresh companies and proves actual
Rust authentication, knowledge tests, PDF export, invitation acceptance and tenant privacy. Resend mode reads
actual unique test inboxes and checks message authentication; it never bypasses verification. Public browser
traces/screenshots are disabled to avoid retaining OTPs/cookies. Data persists; tests never reset the stand.
Opt-in documentation screenshots are normally skipped. All 36 ordinary browser tests passed in private CI.
Both live domain scenarios and owner real-email login passed; independent read-only UI/log checks passed.
Release execution and exact live SHA: issues #38/#40; earlier full product/browser evidence: closed issue #31.

Last commit: 5c00c2f185849cdff8dba0bb8701420eab4eb44a (verified implementation); integrated release receipt: issues #38/#40.
