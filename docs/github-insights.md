# GitHub insights

A candidate connects a GitHub account by login or profile link. The separate loopback service
[`fsp-github-insights`](../backend/crates/github-insights) collects the account's **public** activity and turns it
into documented heuristics, a 0–100 index and integrity flags. The career API stores the report with the source,
shows it to the candidate in full and gives employers an anonymous projection. The algorithm is
`github-insights-v1`; changing a threshold or weight means a new version.

## Principles

- **Public only.** Every repository reference is filtered by `isPrivate`, whatever the configured token can see.
  Organization memberships come from GitHub's public-membership endpoint. Daily activity is rebuilt from public
  contributions, not from the profile calendar, which also counts private work. Private contributions appear only as
  the bare count GitHub publishes and never enter a score. An account analyzed with its owner's token gets the same
  report as with anyone else's.
- **Verifiable over self-declared.** Collaboration counts work accepted or reviewed by **another human** outside the
  account's own organizations. Technologies count only with an artifact (code share, a manifest dependency, a
  container file, an explicit topic) in repositories the candidate owns or substantially develops.
- **Saturating, not cumulative.** Every metric maps onto 0–100 with a fixed threshold. Volume beyond the threshold
  earns nothing, so automated commit floods cannot buy a higher index.
- **Flags lower confidence, never add points.** Anomalies are explained to the candidate and, when they are
  warnings, to employers.
- **No grade.** The index measures the amount and quality of public evidence. Only the knowledge assessment confirms a
  skill or a grade; the index does not change matching or search order ([business rules §3](product/BUSINESS_RULES.md#3-sources-and-evidence)).

## Data collected

Within a 38-second deadline (the API's integration budget is 45 seconds), in four parallel stages:

| Data | Source | Bound |
| --- | --- | --- |
| Profile: creation date, followers, contribution years, bio (ownership check only, never stored) | GraphQL `user` | — |
| Yearly public commits, pull requests, reviews and issues per repository and per day | GraphQL `contributionsCollection` per calendar year | last 10 active years; 100 repositories and 100 days per repository per year (GitHub limits; totals stay exact) |
| Owned public repositories | GraphQL `repositories(privacy: PUBLIC)` | 300 most recently pushed |
| Recent authored pull requests with merger and reviewers | GraphQL `pullRequests` | 200 most recent |
| Pull requests into other owners' public repositories | GraphQL `search` (`is:pr is:public author:X -user:X -org:…`), adaptive | up to three rounds of 100 |
| Public organization memberships | REST `GET /users/{login}/orgs` (public memberships whatever the token) | 100 |
| Primary repositories: languages, root tree, `.github`, workflows, `Cargo.toml`, `package.json` | GraphQL `repository` batches | 24 by commit contributions |
| Commit history with sizes, signatures and authorship share | GraphQL `history(author:)` per primary repository | 100 commits per repository, last 3 years |
| Author time zone | REST commit patch `Date:` header, streamed until the header | one small commit per month, 24 months |

GitHub's JSON APIs normalize commit dates to UTC; only the mailbox-format patch keeps the author's offset, so the
service reads that header (and ignores the e-mail header). Each commit uses the offset of the nearest sample in time,
which follows travel and daylight-saving changes month by month.

A stage that misses its deadline keeps what it has and marks the report partial. Reports are cached for ten minutes
per login and concurrent requests for one login share one analysis. The client retries GitHub's 10-second GraphQL
timeout once, honors `retry-after` and `x-ratelimit-reset`, and runs at most two analyses and twelve requests at a
time ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). A heavy
account costs about 50 GraphQL points of the token's 5 000 per hour.

## Ownership

A login alone is a claim. The candidate proves control by placing a per-candidate code (`fsp-` plus ten hex
characters, an HMAC of the candidate id under the server key) in the GitHub bio and updating the source; the service
checks the bio and discards it. An OAuth token of the same account (when OAuth is configured) proves it too. A proven
login belongs to one candidate (`409 github_account_taken`); an unproven claim stays visible as «не подтверждено» to
employers.

## Account roles

| Term | Rule |
| --- | --- |
| Affiliated owner | The account itself, its public organizations, owners where it merged its own pull request (merge rights), and owners where it commits to three or more repositories (organization-wide write access) |
| Led repository | At least 10 and at least half of the default-branch commits in the 3-year window are the account's |
| Independent repository | Neither affiliated nor led |
| Substantive repository | Not a fork or template, and owned or with at least 10 commit contributions |
| Peer-validated pull request | Merged by, or reviewed by, a different human (`User`, not `Bot`) |

## Dimensions and metrics

Scores use `ramp(value, zero, full)` (linear, clamped), `log(value, full)` (`ln(1+v)/ln(1+full)`, clamped) and
`inverse(value, full_until, zero_at)`. A dimension is the weighted mean of its available metrics; the index is the
weighted mean of the dimensions. Bands: 0–24 weak, 25–49 moderate, 50–74 strong, 75–100 very strong.

| Dimension (weight) | Metric | Score | Weight |
| --- | --- | --- | --- |
| Регулярность (25%) | Active weeks of the last 52 | `ramp(0, 40)` | 35 |
| | Longest run of active weeks | `ramp(0, 26)` | 20 |
| | Current run of active weeks | `ramp(0, 12)` | 15 |
| | Active months of the last 24 | `ramp(0, 20)` | 15 |
| | Weekly burstiness B = (σ − μ)/(σ + μ) | 100 at B ≤ 0, 0 at B ≥ 0.8 | 15 |
| Вовлечённость (20%) | Public contributions, last year | `log(1000)` | 20 |
| | Active days, last year | `ramp(0, 180)` | 25 |
| | Longest run of consecutive days | `ramp(0, 30)` | 15 |
| | Median active days per active week | `ramp(0, 5)` | 10 |
| | Median estimated time per active day (≥ 20 sampled commits) | `ramp(0, 180 min)`; weight 0 when automation is flagged | 15 |
| | Days since the last activity | `inverse(14, 180)` | 15 |
| Стаж (15%) | Account age, years | `ramp(0, 6)` | 30 |
| | Years with public contributions | `ramp(0, 5)` | 40 |
| | Years with 50+ active days | `ramp(0, 4)` | 30 |
| Совместная работа (20%) | Peer-validated pull requests | `log(25)` | 35 |
| | Reviews in independent repositories | `log(50)` | 25 |
| | Independent repositories with accepted work (commits, merged PRs, reviews; issues excluded) | `ramp(0, 10)` | 20 |
| | Merged PRs into independent repositories | `log(25)` | 20 |
| | Merge rate into independent repositories (≥ 3 decided) | `ramp(30%, 90%)` | 10 |
| Инженерная культура (15%, needs a substantive repository) | Shares of substantive repositories with README, license, CI, tests, lockfile, linters, dependency updates | the percentage | 10, 10, 20, 20, 10, 10, 5 |
| | Descriptive commit headlines | the percentage | 10 |
| | Median commit size | 100 for 5–400 lines; 50, 60 or 20 outside | 5 |
| Признание (5%) | Stars of substantive repositories | `log(500)` | 35 |
| | Forks of owned repositories | `log(100)` | 15 |
| | Independent projects from 1 000 stars with ≥ 3 commits or a merged PR | `ramp(0, 3)` | 40 |
| | Followers | `log(200)` | 10 |

Stars and followers are gameable ([StarScout](https://arxiv.org/abs/2412.13459) found millions of fake stars), so
impact carries 5% of the index and the notable-project metric needs accepted work.

Tests are detected from root-level directories and configuration files only; inline tests deeper in the tree are
not seen. CI covers GitHub Actions workflows and the common root-level CI files.

## Work rhythm

From the sampled commits in the author's local time: the hour-of-day and weekday distributions; the shares on
weekdays 09:00–18:59, evenings after 19:00, nights before 06:00 and weekends; time zones. Sessions follow the
[git-hours](https://github.com/kimmobrunfeldt/git-hours) convention: commits up to 120 minutes apart form a session,
which is credited its span plus 30 minutes before the first commit. The report gives the median and 90th-percentile
time per active day, sessions per active day and the longest session. These are estimates from timestamps, not
working time, and they never reward long days: the score saturates at three hours. Commit times vary widely between
people, so rhythm is described rather than judged ([Claes et al., ICSE 2018](https://arxiv.org/abs/1802.05084)).

## Integrity flags

| Flag | Severity | Condition |
| --- | --- | --- |
| `future_dated` | warning | Commits authored more than a day in the future |
| `uniform_commit_minute` | warning | ≥ 20 sampled commits and ≥ 40% at one local minute of the day |
| `repeated_messages` | warning | ≥ 20 sampled commits and ≥ 50% with one headline |
| `padding_repository` | warning | ≥ 100 commits last year; an owned or led repository under 10 stars holds ≥ 80% of commits; ≥ 30 sampled commits there, ≥ 70% of them one or two lines |
| `high_commit_rate` | info, lowers confidence | Median ≥ 25 commits per active day: automation or AI agents; time per day leaves the index |
| `contributions_exceed_history` | info, lowers confidence | GitHub counted ≥ 100 recent commits in a repository, more than twice what its default branch still holds |
| `rewritten_history` | info | ≥ 50% of ≥ 20 sampled commits authored more than 30 days before they were committed |
| `new_account_burst` | info | Account younger than 120 days with ≥ 300 contributions |
| `mostly_private` | info | Private contributions are ≥ 60% of the year |
| `fork_heavy` | info | ≥ 70% of ≥ 10 owned repositories are forks |
| `self_merged_pull_requests` | info | ≥ 30 sampled pull requests, ≥ 20 merged, under 5% peer-validated |
| `repository_cap` | info | GitHub's 100-repository limit was reached in a year |
| `timezone_unknown`, `low_public_data` | info | No time-zone sample; fewer than 10 active days and commits |

Confidence is high with ≥ 150 sampled commits, ≥ 60 active days and two active years; medium with ≥ 30 commits and
≥ 15 active days; low otherwise. A warning, `high_commit_rate` or `contributions_exceed_history` lowers it one
level; a partial report is at most medium.

## Employer projection

Before any disclosure employers see the index, band, confidence, ownership state, dimension scores and summaries,
metrics rounded for display (counts to two significant figures, shares to 5%, days per week exact, time per day in
half-hour bands), up to five languages, highlights without names, warning flags and whether most work is private.
The projection never contains the login, repository or organization names, links, calendars or exact counts: a
contribution calendar or an exact total could identify the person. After the candidate accepts an invitation or
applies, the chosen «source links» disclose the profile.

## Validation

- Unit tests cover streaks, burstiness, time-zone sessions, message classification, affiliation, led repositories,
  padding and generated-history flags, saturation, rounding and the projection
  (`cargo test -p fsp-github-insights`).
- A fake-GitHub service test proves that a private repository returned by the API appears nowhere in the report and
  that the bio code is verified.
- Golden fixtures in [`contracts/fixtures`](../contracts/fixtures) are the Rust serialization; the mock suite
  validates them against the OpenAPI schemas, so the backend and the contract cannot drift.
- Calibration on public accounts of different profiles (a prolific open-source maintainer, a kernel maintainer, a
  developer working mostly through AI agents in own organizations, a modest account and an almost empty one) produced
  distinct, explainable results; it surfaced and fixed self-merged and own-organization work counted as
  collaboration, automated pull requests hiding external ones, and version-bump commits mistaken for padding.

The thresholds are a transparent prototype, not a calibrated predictor of job performance. Measuring agreement with
expert ratings or hiring outcomes needs labelled data that does not exist yet. Research on hiring signals found that
employers value long-term activity and contributions to established projects but mostly glance at aggregates
([Marlow & Dabbish, CSCW 2013](https://www.cs.cmu.edu/~xia/resources/Documents/Marlow-cscw13.pdf)); predicting
library expertise from activity features proved hard ([Montandon et al., MSR 2019](https://arxiv.org/abs/1903.08113)).
The report therefore explains every number and leaves the decision to people.

## Operation

The service listens on `127.0.0.1:4030` (`fsp-github-insights.service`). It needs `GITHUB_TOKEN` in
`/etc/fsp/github-insights.env`; a fine-grained token with public read-only access is enough, and without one
`/health` reports `missing_token`. The API enables the integration with `FSP_GITHUB_INSIGHTS_URL`
(`meta.capabilities.githubInsights`). Use of GitHub data follows GitHub's
[Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies):
the candidate starts the analysis for their own profile, nothing is collected about people who did not connect, and
no personal data is sold or used for unsolicited contact.
