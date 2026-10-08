# Domain and email release — issue #38

The approved target is `https://nddev.link` on the existing stand at
`188.166.88.183`. Real verification mail replaces public demo codes. The owner
authorized a delivery/login test to `danil@nddev.ai`. GitHub OAuth stays deferred;
the private fictional FSP provider and knowledge assessments stay in place.

## Implementation and acceptance sequence

1. Inspect current DNS, certificates, authentication, deployment and public tests.
   Cloudflare zone is active and initially had no records. The application only
   supported fixed demo codes; deployment required an IPv4 public URL.
2. Obtain an origin certificate while the IP stand stays available. Parameterize
   the nginx hostname and certificate, preserve renewal/provisioning, trust client
   IP headers only from Cloudflare's published networks, and prevent API caching.
   Verify both direct origin TLS and Cloudflare Full (strict) TLS.
3. Add a bounded Resend HTTP adapter, cryptographically random six-digit codes,
   challenge-bound HMAC digests and a separate session HMAC namespace. Require
   production secrets at startup before migration. Enabling the new secret must
   invalidate old demo sessions/codes without deleting account data.
4. Serialize real-mail issuance limits in PostgreSQL: one request per minute and
   five per fifteen minutes per normalized email, including failed sends. Preserve
   the cumulative five-attempt verification budget and single-use consumption.
   Test races, failed delivery, provider failures and production login over HTTP.
5. Verify a sending subdomain in Resend using its actual DNS records; disable
   tracking, publish SPF/DKIM/DMARC, and install a domain-restricted sending key
   outside git. Provider access is configured; the owner confirmed the first test message reached their inbox.
6. Update the frontend's real-mail guidance and release acceptance. Automated
   production login must read a real delivered OTP through a dedicated test inbox;
   no public fixed codes, hidden login bypass or silent skipped release gate.
7. Run relevant Rust, contract, frontend, browser and release-failure checks.
   Commit cohesive changes on `feat/38-domain-email`, PR into `danil`, let checked
   integration PRs reach `main`, and deploy that exact commit. Retain rollback support.
   Actions billing prevented jobs from starting, and runner registration requires unavailable admin rights.
   Issue #40 replaces Actions with four real private-server gates and checked PR integration, as authorized.
8. Activate domain/mail configuration, verify real delivery and browser login,
   expired/wrong/reused code behavior, cookies, origins and private API caching.
   Provider delivery proves recipient-server acceptance; inbox placement requires
   mailbox evidence or owner confirmation. Obtain independent read-only proof.
9. Reconcile documentation/memories with implemented behavior, synchronize local,
   both remotes and the server, and take/verify a final off-host database backup.

## Primary references checked on 2026-10-08

- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Cloudflare original visitor IPs](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/)
- [Resend domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend send API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend restricted API keys](https://resend.com/docs/api-reference/api-keys/create-api-key)
- [OWASP verification token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

This plan records intended work; completion requires the evidence described above.

## Execution evidence

Real Resend delivery to the owner reached the inbox. Local real-mail Rust/PostgreSQL browser acceptance
passed the candidate and two-company journey, with authenticated received messages. Rust workspace checks
and 67 tests passed; TypeScript/mock/component/build checks passed, and browser accessibility reruns passed
after resolving host disk exhaustion. The external CI run and final public cutover are tracked in issues #38
and #40; these implementation checks alone do not claim a completed public release.
