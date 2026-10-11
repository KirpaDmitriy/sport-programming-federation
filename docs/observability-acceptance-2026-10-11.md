# Observability rollout evidence — October 11, 2026

Issue [#166](https://github.com/KirpaDmitriy/sport-programming-federation/issues/166) follows the owner's request
for self-hosted diagnostics and masked session replay. The existing stand remains the only installation target.

The support services are live: OpenObserve 1.0.4 on loopback 5080 and Vector 0.59.0, both active with zero automatic
restarts at the last check. Measured memory was approximately 330 MiB and 19 MiB respectively, with 301 GiB disk
headroom. These are point-in-time observations, not a capacity benchmark.

Executed proofs:

- Journald → Vector → actual OpenObserve search: unique probe `28598716-1d85-43f0-b4fb-dba98608d817` arrived;
  free-form text, email and authorization canaries were absent. The named ingest-only collector token could not
  read streams. A recent host-memory sample was queried successfully.
- The real browser SDK emitted RUM and compressed replay; the test decompressed the payloads and checked private
  canaries in rendered text, forms, links, attributes, errors and URLs. It observed no external browser requests.
  The same browser scenario also passed against the real server's private OpenObserve endpoint.
- Search returned 100 recent `_rumdata` records and two `_sessionreplay` records; stored replay segments and RUM
  events contained none of the synthetic identity/input canaries. These are test sessions, not a claim that the
  production frontend is recording users yet.
- A temporary loopback nginx using the exact renderer passed configuration validation and five actual HTTP
  tests: reject wrong method, foreign origin, query and unknown path; accept a valid event. Header/query canaries
  did not enter its access log. Production nginx was not reloaded by this test.
- Rust API tests verify a real routed command emits a templated audit record without path/query/header/body
  canaries. Existing transport tests still pass; clippy passes for API and service roots.
- Frontend verification passed 52 unit tests, strict types, lint, production build and bundle checks. The full
  browser suite passed 41 scenarios; screenshot capture and the opt-in RUM scenario were skipped in that run.
  The separate enabled-RUM run passed after the final replay URL restrictions. Release fault tests, 20 CI
  controller tests, two nginx renderer tests and ShellCheck also passed locally.
- The private operations dashboard `7515113281963425792` was created with nine panels. All nine queries passed
  against the real server; metric panels returned recent measurements. Probe
  `ad0207c2-10e7-48f3-a319-e57cedc813d0` also repeated ingest/read-denial/privacy checks. Application panels remain
  empty until the instrumented release produces real events; synthetic probes do not count as API traffic.

The first Vector integration exposed a version change: environment interpolation is disabled by default. The
final configuration uses the supported file secret provider and a separate named ingest-only token, not a root
credential in the collector environment. Actual ingestion was repeated after this correction.

Application audit, the production intake routes and browser instrumentation still require the ordinary CI-gated
main release. At this stage the stand's active application remains `405fecc7a93a524db9913781993e2d28c84c8429`.
Ubuntu CI recovery is tracked in [#161](https://github.com/KirpaDmitriy/sport-programming-federation/issues/161).
Do not close the rollout or describe the application as synchronized until main, the active release, the accepted
deployment receipt and public acceptance agree.

Configuration, commands, privacy limits and operational queries: [observability runbook](../infra/observability/README.md).
