//! Heuristics: a [`Snapshot`] of public facts becomes a [`GitHubReport`].
//!
//! Every metric is a documented, deterministic function of public data (see
//! `docs/github-insights.md`). Scores map metrics onto 0–100 with fixed thresholds; they are
//! saturating, so volume beyond a reasonable level earns nothing more. Integrity flags never add
//! points: they lower confidence and explain anomalies.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use chrono::{DateTime, Datelike, Duration, NaiveDate, Timelike, Utc};
use fsp_domain::{
    FlagSeverity, GITHUB_INSIGHTS_VERSION, GitHubActivity, GitHubCollaboration,
    GitHubContributedOrganization, GitHubCoverage, GitHubCraft, GitHubDay, GitHubDimension,
    GitHubDimensionId, GitHubFlag, GitHubIndex, GitHubLanguageShare, GitHubMetric,
    GitHubNotableContribution, GitHubOffsetShare, GitHubOrganization, GitHubOrganizations,
    GitHubReport, GitHubRepositoryInsight, GitHubRhythm, GitHubTechnology, GitHubYear,
    HygieneSignal, SignalBand, SignalConfidence,
};

use crate::snapshot::{
    CommitFact, PrimaryRepository, PullRequestFact, PullRequestState, RepositoryRef, Snapshot,
};
use crate::tech;

/// A gap of up to two hours between commits continues a work session (git-hours convention).
const SESSION_GAP_MINUTES: i64 = 120;
/// Work before the first commit of a session is unknown; credit a conservative half hour.
const FIRST_COMMIT_MINUTES: i64 = 30;
/// Median commits per active day above which volume looks automated.
const AUTOMATION_COMMITS_PER_DAY: u32 = 25;

pub fn build_report(snapshot: &Snapshot) -> GitHubReport {
    let today = snapshot.now.date_naive();
    let activity = Activity::compute(snapshot, today);
    let rhythm = Rhythm::compute(&snapshot.commits, &snapshot.timezone_samples);
    let collaboration = Collaboration::compute(snapshot);
    let craft = Craft::compute(snapshot);
    let impact = Impact::compute(snapshot, &collaboration);
    let flags = flags(snapshot, &activity, rhythm.as_ref(), &collaboration, &craft);
    let automated = flags.iter().any(|flag| flag.id == "high_commit_rate");

    let mut dimensions = vec![
        consistency_dimension(&activity),
        engagement_dimension(&activity, rhythm.as_ref(), automated),
        longevity_dimension(snapshot, &activity, today),
        collaboration_dimension(&collaboration),
        impact_dimension(&impact),
    ];
    if let Some(dimension) = craft_dimension(&craft) {
        dimensions.insert(4, dimension);
    }
    let weight_sum: u32 = dimensions
        .iter()
        .map(|dimension| u32::from(dimension.weight))
        .sum();
    let weighted: u32 = dimensions
        .iter()
        .map(|dimension| u32::from(dimension.weight) * u32::from(dimension.score))
        .sum();
    let score = (weighted + weight_sum / 2)
        .checked_div(weight_sum)
        .unwrap_or(0) as u8;
    let confidence = confidence(snapshot, &activity, &flags);
    let languages = languages(snapshot);
    let highlights = highlights(&activity, &collaboration, &craft, &impact, &languages);

    GitHubReport {
        algorithm_version: GITHUB_INSIGHTS_VERSION.into(),
        generated_at: snapshot
            .now
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        login: snapshot.login.clone(),
        profile_url: format!("https://github.com/{}", snapshot.login),
        account_created_at: snapshot
            .created_at
            .map(|time| time.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
            .unwrap_or_default(),
        coverage: coverage(snapshot),
        index: GitHubIndex {
            score,
            band: SignalBand::from_score(score),
            confidence,
        },
        dimensions,
        activity: activity.report.clone(),
        rhythm: rhythm.as_ref().map(|rhythm| rhythm.report.clone()),
        collaboration: collaboration.report.clone(),
        organizations: organizations(snapshot),
        languages,
        technologies: technologies(snapshot),
        craft: craft.report.clone(),
        repositories: repositories(snapshot, &craft),
        flags,
        highlights,
    }
}

// ---------------------------------------------------------------------------------------------
// Activity

struct Activity {
    report: GitHubActivity,
    active_months_24: u32,
    sustained_years: u32,
    /// Goh–Barabási burstiness of weekly activity over the last year, in hundredths (−100..100).
    burstiness: Option<i32>,
    days_per_active_week: Option<u32>,
    days_since_last: Option<i64>,
    commits_last_year: u32,
}

impl Activity {
    fn compute(snapshot: &Snapshot, today: NaiveDate) -> Self {
        let window_start = today - Duration::days(364);
        let active = snapshot
            .days
            .iter()
            .filter(|(date, day)| day.total() > 0 && **date <= today)
            .map(|(date, _)| *date)
            .collect::<Vec<_>>();
        let in_window = active
            .iter()
            .copied()
            .filter(|date| *date >= window_start)
            .collect::<Vec<_>>();
        let count_between = |from: NaiveDate, to: NaiveDate| -> u32 {
            snapshot
                .days
                .range(from..=to)
                .map(|(_, day)| day.total())
                .sum()
        };
        let contributions_last_year = count_between(window_start, today);
        let commits_last_year = snapshot
            .days
            .range(window_start..=today)
            .map(|(_, day)| day.commits)
            .sum();
        let week_of = |date: NaiveDate| {
            date - Duration::days(i64::from(date.weekday().num_days_from_monday()))
        };
        let window_weeks = in_window
            .iter()
            .map(|date| week_of(*date))
            .collect::<BTreeSet<_>>();
        let all_weeks = active
            .iter()
            .map(|date| week_of(*date))
            .collect::<BTreeSet<_>>();
        let (longest_daily, current_daily) = runs(&active, 1, today);
        let weeks = all_weeks.iter().copied().collect::<Vec<_>>();
        let (longest_weekly, current_weekly) = runs(&weeks, 7, week_of(today));
        let longest_gap = in_window
            .windows(2)
            .map(|pair| (pair[1] - pair[0]).num_days() - 1)
            .max()
            .unwrap_or(0)
            .max(0) as u32;
        let recent = count_between(today - Duration::days(181), today);
        let previous = count_between(today - Duration::days(363), today - Duration::days(182));
        let trend_percent = match (previous, recent) {
            (0, 0) => None,
            (0, _) => Some(100),
            (previous, recent) => {
                Some(((i64::from(recent) - i64::from(previous)) * 100 / i64::from(previous)) as i32)
            }
        };
        let month_start = |date: NaiveDate| (date.year(), date.month());
        let months_24 = active
            .iter()
            .filter(|date| **date > today - Duration::days(730))
            .map(|date| month_start(*date))
            .collect::<BTreeSet<_>>()
            .len() as u32;
        let mut weekly_counts = BTreeMap::new();
        for (date, day) in snapshot.days.range(window_start..=today) {
            *weekly_counts.entry(week_of(*date)).or_insert(0u32) += day.total();
        }
        let first_week = week_of(window_start);
        let counts = (0..52)
            .map(|week| {
                weekly_counts
                    .get(&(first_week + Duration::days(7 * week)))
                    .copied()
                    .unwrap_or(0)
            })
            .collect::<Vec<_>>();
        let burstiness = (contributions_last_year > 0).then(|| burstiness(&counts));
        let mut days_per_week = BTreeMap::new();
        for date in &in_window {
            *days_per_week.entry(week_of(*date)).or_insert(0u32) += 1;
        }
        let days_per_active_week = median(days_per_week.values().copied().collect());
        let yearly = snapshot
            .years
            .iter()
            .map(|year| {
                let from = NaiveDate::from_ymd_opt(year.year, 1, 1).unwrap_or(today);
                let to = NaiveDate::from_ymd_opt(year.year, 12, 31).unwrap_or(today);
                GitHubYear {
                    year: year.year,
                    contributions: year.totals.commits
                        + year.totals.pull_requests
                        + year.totals.reviews
                        + year.totals.issues,
                    commits: year.totals.commits,
                    pull_requests: year.totals.pull_requests,
                    reviews: year.totals.reviews,
                    issues: year.totals.issues,
                    private_contributions: year.restricted,
                    active_days: snapshot
                        .days
                        .range(from..=to)
                        .filter(|(_, day)| day.total() > 0)
                        .count() as u32,
                }
            })
            .collect::<Vec<_>>();
        let active_years = yearly.iter().filter(|year| year.contributions > 0).count() as u32;
        let sustained_years = yearly.iter().filter(|year| year.active_days >= 50).count() as u32;
        let calendar = (0..365)
            .map(|offset| {
                let date = window_start + Duration::days(offset);
                GitHubDay {
                    date: date.format("%Y-%m-%d").to_string(),
                    count: snapshot.days.get(&date).map_or(0, |day| day.total()),
                }
            })
            .collect();
        let last = active.last().copied();
        Self {
            report: GitHubActivity {
                active_years,
                contributions_last_year,
                private_contributions_last_year: snapshot.restricted_last_year,
                active_days_last_year: in_window.len() as u32,
                active_weeks_last_year: (window_weeks.len() as u32).min(52),
                longest_daily_streak: longest_daily,
                current_daily_streak: current_daily,
                longest_weekly_streak: longest_weekly,
                current_weekly_streak: current_weekly,
                longest_gap_days_last_year: longest_gap,
                last_active_on: last.map(|date| date.format("%Y-%m-%d").to_string()),
                trend_percent,
                calendar,
                yearly,
            },
            active_months_24: months_24,
            sustained_years,
            burstiness,
            days_per_active_week,
            days_since_last: last.map(|date| (today - date).num_days()),
            commits_last_year,
        }
    }
}

/// Longest run and the run that is still current (ending at `current` or one step before), for
/// sorted distinct dates spaced `step` days apart.
fn runs(dates: &[NaiveDate], step: i64, current: NaiveDate) -> (u32, u32) {
    let mut longest = 0;
    let mut run = 0;
    let mut previous: Option<NaiveDate> = None;
    for date in dates {
        run = match previous {
            Some(before) if (*date - before).num_days() == step => run + 1,
            _ => 1,
        };
        longest = longest.max(run);
        previous = Some(*date);
    }
    let ongoing = previous.is_some_and(|last| (current - last).num_days() <= step);
    (longest, if ongoing { run } else { 0 })
}

/// B = (σ − μ) / (σ + μ): −1 is perfectly regular, 0 is random (Poisson-like), 1 is bursty.
fn burstiness(counts: &[u32]) -> i32 {
    let n = counts.len() as f64;
    let mean = counts.iter().map(|value| f64::from(*value)).sum::<f64>() / n;
    let variance = counts
        .iter()
        .map(|value| (f64::from(*value) - mean).powi(2))
        .sum::<f64>()
        / n;
    let sigma = variance.sqrt();
    if sigma + mean == 0.0 {
        return 0;
    }
    ((sigma - mean) / (sigma + mean) * 100.0).round() as i32
}

// ---------------------------------------------------------------------------------------------
// Rhythm

struct Rhythm {
    report: GitHubRhythm,
    median_commits_per_day: u32,
    top_minute_share: u8,
}

impl Rhythm {
    fn compute(
        commits: &[CommitFact],
        samples: &[crate::snapshot::TimezoneSample],
    ) -> Option<Self> {
        if commits.len() < 10 {
            return None;
        }
        let mut samples = samples.to_vec();
        samples.sort_by_key(|sample| sample.at);
        let offset_at = |time: DateTime<Utc>| -> i32 {
            samples
                .iter()
                .min_by_key(|sample| (sample.at - time).num_seconds().abs())
                .map_or(0, |sample| sample.offset_minutes)
        };
        let local = commits
            .iter()
            .map(|commit| {
                let offset = offset_at(commit.authored_at);
                (
                    commit,
                    commit.authored_at + Duration::minutes(i64::from(offset)),
                    offset,
                )
            })
            .collect::<Vec<_>>();
        let total = local.len() as u32;
        let mut hourly = [0u32; 24];
        let mut weekdays = [0u32; 7];
        let mut office = 0;
        let mut evening = 0;
        let mut night = 0;
        let mut weekend = 0;
        let mut offsets: BTreeMap<i32, u32> = BTreeMap::new();
        let mut minutes: HashMap<(u32, u32), u32> = HashMap::new();
        let mut per_day: BTreeMap<NaiveDate, u32> = BTreeMap::new();
        for (_, time, offset) in &local {
            let hour = time.hour();
            let weekday = time.weekday().num_days_from_monday();
            hourly[hour as usize] += 1;
            weekdays[weekday as usize] += 1;
            *offsets.entry(*offset).or_insert(0) += 1;
            *minutes.entry((hour, time.minute())).or_insert(0) += 1;
            *per_day.entry(time.date_naive()).or_insert(0) += 1;
            if weekday >= 5 {
                weekend += 1;
            } else if (9..19).contains(&hour) {
                office += 1;
            }
            if hour >= 19 {
                evening += 1;
            }
            if hour < 6 {
                night += 1;
            }
        }
        // Sessions in UTC order; each is attributed to the local day where it starts.
        let mut ordered = local.clone();
        ordered.sort_by_key(|(commit, _, _)| commit.authored_at);
        let mut sessions: Vec<(NaiveDate, i64)> = Vec::new();
        let mut start = ordered[0].0.authored_at;
        let mut start_day = ordered[0].1.date_naive();
        let mut last = start;
        for (commit, time, _) in ordered.iter().skip(1) {
            if (commit.authored_at - last).num_minutes() <= SESSION_GAP_MINUTES {
                last = commit.authored_at;
                continue;
            }
            sessions.push((
                start_day,
                (last - start).num_minutes() + FIRST_COMMIT_MINUTES,
            ));
            start = commit.authored_at;
            start_day = time.date_naive();
            last = start;
        }
        sessions.push((
            start_day,
            (last - start).num_minutes() + FIRST_COMMIT_MINUTES,
        ));
        let mut day_minutes: BTreeMap<NaiveDate, i64> = BTreeMap::new();
        let mut day_sessions: BTreeMap<NaiveDate, u32> = BTreeMap::new();
        for (day, length) in &sessions {
            *day_minutes.entry(*day).or_insert(0) += length;
            *day_sessions.entry(*day).or_insert(0) += 1;
        }
        let mut daily = day_minutes
            .values()
            .map(|minutes| (*minutes).clamp(0, 24 * 60) as u32)
            .collect::<Vec<_>>();
        daily.sort_unstable();
        let active_days = daily.len() as u32;
        let p90 = daily
            .get(((daily.len() * 9).div_ceil(10)).saturating_sub(1))
            .copied()
            .unwrap_or(0);
        let session_count = sessions.len() as u32;
        let top_minute = minutes.values().copied().max().unwrap_or(0);
        Some(Self {
            report: GitHubRhythm {
                sample_size: total,
                timezone_inferred: !samples.is_empty(),
                timezone_offsets: offsets
                    .iter()
                    .map(|(offset, count)| GitHubOffsetShare {
                        offset_minutes: *offset,
                        percent: percent(*count, total),
                    })
                    .filter(|share| share.percent > 0)
                    .collect(),
                hourly_percent: hourly.iter().map(|count| percent(*count, total)).collect(),
                weekday_percent: weekdays
                    .iter()
                    .map(|count| percent(*count, total))
                    .collect(),
                office_hours_percent: percent(office, total),
                evening_percent: percent(evening, total),
                night_percent: percent(night, total),
                weekend_percent: percent(weekend, total),
                active_days,
                median_minutes_per_active_day: median(daily.clone()).unwrap_or(0),
                p90_minutes_per_active_day: p90,
                sessions_per_active_day_tenths: (session_count * 10 + active_days / 2)
                    .checked_div(active_days)
                    .unwrap_or(0),
                longest_session_minutes: sessions
                    .iter()
                    .map(|(_, length)| (*length).clamp(0, 24 * 60) as u32)
                    .max()
                    .unwrap_or(0),
            },
            median_commits_per_day: median(per_day.values().copied().collect()).unwrap_or(0),
            top_minute_share: percent(top_minute, total),
        })
    }
}

// ---------------------------------------------------------------------------------------------
// Collaboration

struct Collaboration {
    report: GitHubCollaboration,
    peer_validated: u32,
    sampled: u32,
    merged_sampled: u32,
    reviews_of_others: u32,
}

/// Owners whose repositories count as the account's own work: the account, its public
/// organizations, owners where it merged its own pull requests (merge rights) and owners where it
/// commits to three or more repositories (organization-wide write access).
fn affiliated_owners(snapshot: &Snapshot) -> BTreeSet<String> {
    let mut owners = BTreeSet::from([snapshot.login.to_ascii_lowercase()]);
    let mut repositories_by_owner: BTreeMap<String, BTreeSet<&str>> = BTreeMap::new();
    for year in &snapshot.years {
        for item in &year.commit_repositories {
            repositories_by_owner
                .entry(item.repository.owner_login.to_ascii_lowercase())
                .or_default()
                .insert(item.repository.name_with_owner.as_str());
        }
    }
    owners.extend(
        repositories_by_owner
            .into_iter()
            .filter(|(_, repositories)| repositories.len() >= 3)
            .map(|(owner, _)| owner),
    );
    owners.extend(
        snapshot
            .organizations
            .iter()
            .map(|organization| organization.login.to_ascii_lowercase()),
    );
    owners.extend(
        pull_requests(snapshot)
            .into_iter()
            .filter(|pull| pull.merged_by_self)
            .map(|pull| pull.repository.owner_login.to_ascii_lowercase()),
    );
    owners
}

/// Recent and external pull requests, each once.
fn pull_requests(snapshot: &Snapshot) -> Vec<&PullRequestFact> {
    let mut seen = BTreeSet::new();
    snapshot
        .pull_requests
        .iter()
        .chain(&snapshot.external_pull_requests)
        .filter(|pull| seen.insert(pull.url.as_str()))
        .collect()
}

fn accepted_entry<'a>(
    accepted: &'a mut BTreeMap<String, GitHubNotableContribution>,
    organization_repositories: &mut BTreeSet<String>,
    repository: &RepositoryRef,
) -> &'a mut GitHubNotableContribution {
    if repository.owner_is_organization {
        organization_repositories.insert(repository.name_with_owner.clone());
    }
    accepted
        .entry(repository.name_with_owner.clone())
        .or_insert_with(|| GitHubNotableContribution {
            repository: repository.name_with_owner.clone(),
            url: format!("https://github.com/{}", repository.name_with_owner),
            stars: repository.stars,
            commits: 0,
            merged_pull_requests: 0,
            reviews: 0,
        })
}

/// Repositories where the account authored at least half of the default-branch commits in the
/// history window: its own project even when an organization hosts it.
fn led_repositories(snapshot: &Snapshot) -> BTreeSet<String> {
    snapshot
        .history_shares
        .iter()
        .filter(|(_, share)| share.authored >= 10 && share.authored * 2 >= share.total)
        .map(|(name, _)| name.clone())
        .collect()
}

impl Collaboration {
    fn compute(snapshot: &Snapshot) -> Self {
        let affiliated = affiliated_owners(snapshot);
        let led = led_repositories(snapshot);
        let independent = |repository: &RepositoryRef| {
            !affiliated.contains(&repository.owner_login.to_ascii_lowercase())
                && !led.contains(&repository.name_with_owner)
        };
        let totals = snapshot.years.iter().fold((0, 0, 0), |sum, year| {
            (
                sum.0 + year.totals.pull_requests,
                sum.1 + year.totals.reviews,
                sum.2 + year.totals.issues,
            )
        });
        let sample = pull_requests(snapshot);
        let external = sample
            .iter()
            .copied()
            .filter(|pull| independent(&pull.repository))
            .collect::<Vec<_>>();
        let external_merged = external
            .iter()
            .filter(|pull| pull.state == PullRequestState::Merged)
            .count() as u32;
        let external_decided = external
            .iter()
            .filter(|pull| pull.state != PullRequestState::Open)
            .count() as u32;
        let mut lines = sample
            .iter()
            .map(|pull| pull.additions.saturating_add(pull.deletions))
            .collect::<Vec<_>>();
        lines.sort_unstable();
        // Accepted work only: commits on the default branch, merged pull requests and reviews.
        // Issues and unmerged pull requests show interest, not accepted contribution.
        let mut accepted: BTreeMap<String, GitHubNotableContribution> = BTreeMap::new();
        let mut organization_repositories = BTreeSet::new();
        let mut reviews_of_others = 0;
        for year in &snapshot.years {
            for item in year
                .commit_repositories
                .iter()
                .filter(|item| independent(&item.repository))
            {
                accepted_entry(
                    &mut accepted,
                    &mut organization_repositories,
                    &item.repository,
                )
                .commits += item.count;
            }
            for item in year
                .review_repositories
                .iter()
                .filter(|item| independent(&item.repository))
            {
                reviews_of_others += item.count;
                accepted_entry(
                    &mut accepted,
                    &mut organization_repositories,
                    &item.repository,
                )
                .reviews += item.count;
            }
        }
        for pull in &external {
            if pull.state == PullRequestState::Merged {
                accepted_entry(
                    &mut accepted,
                    &mut organization_repositories,
                    &pull.repository,
                )
                .merged_pull_requests += 1;
            }
        }
        let external_repositories = accepted.len() as u32;
        let mut notable = accepted
            .into_values()
            .filter(|item| item.stars >= 100)
            .collect::<Vec<_>>();
        notable.sort_by(|a, b| b.stars.cmp(&a.stars).then(a.repository.cmp(&b.repository)));
        notable.truncate(10);
        let peer_validated = sample
            .iter()
            .filter(|pull| pull.merged_by_other || pull.reviewed_by_other)
            .count() as u32;
        Self {
            report: GitHubCollaboration {
                pull_requests_total: totals.0,
                reviews_total: totals.1,
                issues_total: totals.2,
                pull_requests_sampled: sample.len() as u32,
                external_pull_requests: external.len() as u32,
                external_merged,
                external_merge_rate_percent: (external_decided >= 3)
                    .then(|| percent(external_merged, external_decided)),
                median_pull_request_lines: median(lines),
                external_repositories,
                organization_repositories: organization_repositories.len() as u32,
                affiliated_organizations: affiliated.len().saturating_sub(1) as u32,
                notable_contributions: notable,
            },
            peer_validated,
            sampled: sample.len() as u32,
            merged_sampled: sample
                .iter()
                .filter(|pull| pull.state == PullRequestState::Merged)
                .count() as u32,
            reviews_of_others,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Craft

struct Craft {
    report: GitHubCraft,
    hygiene: BTreeMap<String, Vec<HygieneSignal>>,
    message_sample: u32,
    repeated_message_share: u8,
}

/// Repositories the account substantially develops: owned or with at least ten commits.
fn substantive(snapshot: &Snapshot) -> Vec<&PrimaryRepository> {
    snapshot
        .primary
        .iter()
        .filter(|repository| {
            !repository.reference.fork
                && !repository.template
                && (repository
                    .reference
                    .owner_login
                    .eq_ignore_ascii_case(&snapshot.login)
                    || repository.contributions >= 10)
        })
        .collect()
}

fn hygiene(repository: &PrimaryRepository) -> Vec<HygieneSignal> {
    let root = repository
        .root
        .iter()
        .map(|(name, directory)| (name.to_ascii_lowercase(), *directory))
        .collect::<Vec<_>>();
    let has = |test: &dyn Fn(&str, bool) -> bool| root.iter().any(|(name, dir)| test(name, *dir));
    let github = repository
        .github_dir
        .iter()
        .map(|name| name.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let mut signals = Vec::new();
    if has(&|name, dir| !dir && name.starts_with("readme")) {
        signals.push(HygieneSignal::Readme);
    }
    if repository.license.is_some()
        || has(&|name, _| {
            name.starts_with("license")
                || name.starts_with("licence")
                || name.starts_with("copying")
        })
    {
        signals.push(HygieneSignal::License);
    }
    const CI: &[&str] = &[
        ".gitlab-ci.yml",
        ".travis.yml",
        ".circleci",
        "azure-pipelines.yml",
        "jenkinsfile",
        ".drone.yml",
        ".woodpecker.yml",
        ".woodpecker",
        "bitbucket-pipelines.yml",
        ".buildkite",
    ];
    if repository.workflows > 0 || has(&|name, _| CI.contains(&name)) {
        signals.push(HygieneSignal::Ci);
    }
    const TEST_DIRS: &[&str] = &[
        "tests",
        "test",
        "__tests__",
        "spec",
        "specs",
        "e2e",
        "testing",
        "integration-tests",
    ];
    const TEST_FILES: &[&str] = &[
        "pytest.ini",
        "tox.ini",
        "karma.conf.js",
        "phpunit.xml",
        "phpunit.xml.dist",
        "nextest.toml",
    ];
    const TEST_CONFIG_PREFIXES: &[&str] = &[
        "jest.config.",
        "vitest.config.",
        "playwright.config.",
        "cypress.config.",
        ".mocharc",
    ];
    if has(&|name, dir| {
        (dir && TEST_DIRS.contains(&name))
            || TEST_FILES.contains(&name)
            || TEST_CONFIG_PREFIXES
                .iter()
                .any(|prefix| name.starts_with(prefix))
    }) {
        signals.push(HygieneSignal::Tests);
    }
    const LOCKFILES: &[&str] = &[
        "cargo.lock",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lock",
        "bun.lockb",
        "poetry.lock",
        "uv.lock",
        "pipfile.lock",
        "go.sum",
        "composer.lock",
        "gemfile.lock",
        "mix.lock",
        "flake.lock",
        "packages.lock.json",
        "gradle.lockfile",
    ];
    if has(&|name, _| LOCKFILES.contains(&name)) {
        signals.push(HygieneSignal::Lockfile);
    }
    const LINT_FILES: &[&str] = &[
        "rustfmt.toml",
        ".rustfmt.toml",
        "clippy.toml",
        ".clippy.toml",
        "deny.toml",
        "biome.json",
        "biome.jsonc",
        ".editorconfig",
        "ruff.toml",
        ".ruff.toml",
        ".pre-commit-config.yaml",
        ".golangci.yml",
        ".golangci.yaml",
        ".rubocop.yml",
        ".flake8",
        ".pylintrc",
        "tslint.json",
        ".clang-format",
        ".clang-tidy",
        ".swiftlint.yml",
        ".scalafmt.conf",
    ];
    const LINT_PREFIXES: &[&str] = &[
        ".eslintrc",
        "eslint.config.",
        ".prettierrc",
        "prettier.config.",
        ".stylelintrc",
    ];
    if has(&|name, _| {
        LINT_FILES.contains(&name) || LINT_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
    }) {
        signals.push(HygieneSignal::Lint);
    }
    let dependency_files = [
        "dependabot.yml",
        "dependabot.yaml",
        "renovate.json",
        "renovate.json5",
    ];
    if github
        .iter()
        .any(|name| dependency_files.contains(&name.as_str()))
        || has(&|name, _| name == "renovate.json" || name.starts_with(".renovaterc"))
    {
        signals.push(HygieneSignal::DependencyUpdates);
    }
    const CONTAINERS: &[&str] = &[
        "dockerfile",
        "containerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ];
    if has(&|name, _| CONTAINERS.contains(&name)) {
        signals.push(HygieneSignal::Container);
    }
    if repository.has_description {
        signals.push(HygieneSignal::Description);
    }
    signals
}

const CONVENTIONAL_TYPES: &[&str] = &[
    "feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert",
];

pub(crate) fn is_conventional(headline: &str) -> bool {
    let Some((head, rest)) = headline.split_once(':') else {
        return false;
    };
    if !rest.starts_with(' ') || rest.trim().is_empty() {
        return false;
    }
    let head = head.strip_suffix('!').unwrap_or(head);
    let kind = match head.split_once('(') {
        Some((kind, scope)) if scope.ends_with(')') && scope.len() > 1 => kind,
        Some(_) => return false,
        None => head,
    };
    CONVENTIONAL_TYPES.contains(&kind.to_ascii_lowercase().as_str())
}

/// A headline says what changed: long enough, not a placeholder, not a web-editor default.
pub(crate) fn is_descriptive(headline: &str) -> bool {
    let text = headline.trim();
    let lower = text.to_lowercase();
    const PLACEHOLDERS: &[&str] = &[
        "update",
        "updates",
        "fix",
        "fixes",
        "wip",
        "test",
        "tests",
        "changes",
        "change",
        "minor",
        "commit",
        ".",
        "-",
        "tmp",
        "temp",
        "asdf",
        "save",
        "stuff",
        "misc",
        "cleanup",
        "refactor",
        "initial commit",
        "first commit",
        "add files via upload",
    ];
    if text.chars().count() < 12 || PLACEHOLDERS.contains(&lower.as_str()) {
        return false;
    }
    let mut words = text.split_whitespace();
    let verb = words.next().unwrap_or_default();
    let object = words.next();
    let single_file = object.is_some_and(|word| word.contains('.')) && words.next().is_none();
    !(["Update", "Create", "Delete", "Rename"].contains(&verb) && single_file)
}

impl Craft {
    fn compute(snapshot: &Snapshot) -> Self {
        let repositories = substantive(snapshot);
        let hygiene_map = repositories
            .iter()
            .map(|repository| {
                (
                    repository.reference.name_with_owner.clone(),
                    hygiene(repository),
                )
            })
            .collect::<BTreeMap<_, _>>();
        let total = hygiene_map.len() as u32;
        let share = |signal: HygieneSignal| {
            percent(
                hygiene_map
                    .values()
                    .filter(|signals| signals.contains(&signal))
                    .count() as u32,
                total,
            )
        };
        let all = &snapshot.commits;
        let regular = all
            .iter()
            .filter(|commit| !commit.is_merge())
            .collect::<Vec<_>>();
        let sample = regular.len() as u32;
        let enough = sample >= 10;
        let mut lines = regular
            .iter()
            .map(|commit| commit.lines())
            .collect::<Vec<_>>();
        lines.sort_unstable();
        let mut headlines: HashMap<&str, u32> = HashMap::new();
        for commit in &regular {
            *headlines.entry(commit.headline.trim()).or_insert(0) += 1;
        }
        let top_headline = headlines.values().copied().max().unwrap_or(0);
        let of = |count: usize| enough.then(|| percent(count as u32, sample));
        Self {
            report: GitHubCraft {
                substantive_repositories: total,
                readme_percent: share(HygieneSignal::Readme),
                license_percent: share(HygieneSignal::License),
                ci_percent: share(HygieneSignal::Ci),
                tests_percent: share(HygieneSignal::Tests),
                lockfile_percent: share(HygieneSignal::Lockfile),
                lint_percent: share(HygieneSignal::Lint),
                dependency_updates_percent: share(HygieneSignal::DependencyUpdates),
                container_percent: share(HygieneSignal::Container),
                conventional_commits_percent: of(regular
                    .iter()
                    .filter(|commit| is_conventional(&commit.headline))
                    .count()),
                descriptive_messages_percent: of(regular
                    .iter()
                    .filter(|commit| is_descriptive(&commit.headline))
                    .count()),
                median_commit_lines: enough.then(|| median(lines.clone()).unwrap_or(0)),
                large_commits_percent: of(lines.iter().filter(|value| **value > 1000).count()),
                signed_commits_percent: of(regular.iter().filter(|commit| commit.signed).count()),
                merge_commits_percent: (all.len() >= 10).then(|| {
                    percent(
                        all.iter().filter(|commit| commit.is_merge()).count() as u32,
                        all.len() as u32,
                    )
                }),
            },
            hygiene: hygiene_map,
            message_sample: sample,
            repeated_message_share: percent(top_headline, sample),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Impact

struct Impact {
    maintained_stars: u32,
    owned_forks: u32,
    notable_external: u32,
    followers: u32,
}

impl Impact {
    fn compute(snapshot: &Snapshot, collaboration: &Collaboration) -> Self {
        Self {
            maintained_stars: substantive(snapshot)
                .iter()
                .map(|repository| repository.reference.stars)
                .sum(),
            owned_forks: snapshot
                .owned
                .iter()
                .filter(|repository| !repository.fork)
                .map(|repository| repository.forks)
                .sum(),
            // Independent projects from 1000 stars that accepted at least three commits or a merge.
            notable_external: collaboration
                .report
                .notable_contributions
                .iter()
                .filter(|item| {
                    item.stars >= 1000 && (item.commits >= 3 || item.merged_pull_requests >= 1)
                })
                .count() as u32,
            followers: snapshot.followers,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Dimensions

struct MetricSpec {
    id: &'static str,
    label: &'static str,
    value: i64,
    display: String,
    public_display: String,
    score: u8,
    weight: u8,
}

fn dimension(
    id: GitHubDimensionId,
    label: &str,
    weight: u8,
    summaries: [&str; 4],
    metrics: Vec<MetricSpec>,
) -> GitHubDimension {
    let total: u32 = metrics.iter().map(|metric| u32::from(metric.weight)).sum();
    let weighted: u32 = metrics
        .iter()
        .map(|metric| u32::from(metric.weight) * u32::from(metric.score))
        .sum();
    let score = (weighted + total / 2).checked_div(total).unwrap_or(0) as u8;
    let summary = match score {
        75..=100 => summaries[0],
        50..=74 => summaries[1],
        25..=49 => summaries[2],
        _ => summaries[3],
    };
    GitHubDimension {
        id,
        label: label.into(),
        score,
        weight,
        summary: summary.into(),
        metrics: metrics
            .into_iter()
            .map(|metric| GitHubMetric {
                id: metric.id.into(),
                label: metric.label.into(),
                value: metric.value,
                display: metric.display,
                public_display: metric.public_display,
                score: metric.score,
            })
            .collect(),
    }
}

fn count_metric(
    id: &'static str,
    label: &'static str,
    value: u32,
    unit: (&str, &str, &str),
    score: u8,
    weight: u8,
) -> MetricSpec {
    MetricSpec {
        id,
        label,
        value: i64::from(value),
        display: with_unit(group(value), value, unit),
        public_display: with_unit(approx(value), approx_value(value), unit),
        score,
        weight,
    }
}

fn percent_metric(
    id: &'static str,
    label: &'static str,
    value: u8,
    score: u8,
    weight: u8,
) -> MetricSpec {
    MetricSpec {
        id,
        label,
        value: i64::from(value),
        display: format!("{value}%"),
        public_display: format!("≈{}%", round_to(u32::from(value), 5)),
        score,
        weight,
    }
}

const DAYS: (&str, &str, &str) = ("день", "дня", "дней");
const WEEKS: (&str, &str, &str) = ("неделя", "недели", "недель");
const MONTHS: (&str, &str, &str) = ("месяц", "месяца", "месяцев");
const YEARS: (&str, &str, &str) = ("год", "года", "лет");
const ITEMS: (&str, &str, &str) = ("", "", "");

fn consistency_dimension(activity: &Activity) -> GitHubDimension {
    let report = &activity.report;
    let regularity = activity.burstiness.map_or(0, |b| {
        // B ≤ 0: at least as regular as random; B ≥ 0.8: activity comes in rare bursts.
        ramp(f64::from(80 - b.clamp(0, 80)), 0.0, 80.0)
    });
    let weeks = report.active_weeks_last_year;
    dimension(
        GitHubDimensionId::Consistency,
        "Регулярность",
        25,
        [
            "Стабильная регулярная активность на протяжении года",
            "Активность в основном регулярная",
            "Активность эпизодическая",
            "Регулярной публичной активности почти нет",
        ],
        vec![
            MetricSpec {
                id: "active_weeks",
                label: "Активных недель за год",
                value: i64::from(weeks),
                display: format!("{weeks} из 52"),
                public_display: format!("≈{} из 52", round_to(weeks, 5).min(52)),
                score: ramp(f64::from(weeks), 0.0, 40.0),
                weight: 35,
            },
            count_metric(
                "longest_weekly_streak",
                "Самая длинная серия активных недель",
                report.longest_weekly_streak,
                WEEKS,
                ramp(f64::from(report.longest_weekly_streak), 0.0, 26.0),
                20,
            ),
            count_metric(
                "current_weekly_streak",
                "Текущая серия активных недель",
                report.current_weekly_streak,
                WEEKS,
                ramp(f64::from(report.current_weekly_streak), 0.0, 12.0),
                15,
            ),
            count_metric(
                "active_months_24",
                "Активных месяцев за два года",
                activity.active_months_24,
                MONTHS,
                ramp(f64::from(activity.active_months_24), 0.0, 20.0),
                15,
            ),
            MetricSpec {
                id: "regularity",
                label: "Равномерность по неделям",
                value: i64::from(activity.burstiness.unwrap_or(0)),
                display: regularity_label(activity.burstiness).into(),
                public_display: regularity_label(activity.burstiness).into(),
                score: regularity,
                weight: 15,
            },
        ],
    )
}

fn regularity_label(burstiness: Option<i32>) -> &'static str {
    match burstiness {
        None => "нет данных",
        Some(value) if value <= 0 => "равномерная",
        Some(value) if value <= 40 => "умеренные всплески",
        Some(_) => "редкие всплески",
    }
}

fn engagement_dimension(
    activity: &Activity,
    rhythm: Option<&Rhythm>,
    automated: bool,
) -> GitHubDimension {
    let report = &activity.report;
    let mut metrics = vec![
        count_metric(
            "contributions_last_year",
            "Публичный вклад за год",
            report.contributions_last_year,
            ITEMS,
            log_ramp(f64::from(report.contributions_last_year), 1000.0),
            20,
        ),
        count_metric(
            "active_days_last_year",
            "Активных дней за год",
            report.active_days_last_year,
            DAYS,
            ramp(f64::from(report.active_days_last_year), 0.0, 180.0),
            25,
        ),
        count_metric(
            "longest_daily_streak",
            "Самая длинная серия дней подряд",
            report.longest_daily_streak,
            DAYS,
            ramp(f64::from(report.longest_daily_streak), 0.0, 30.0),
            15,
        ),
    ];
    if let Some(days) = activity.days_per_active_week {
        metrics.push(count_metric(
            "days_per_active_week",
            "Дней в активную неделю (медиана)",
            days,
            DAYS,
            ramp(f64::from(days), 0.0, 5.0),
            10,
        ));
    }
    if let Some(rhythm) = rhythm.filter(|rhythm| rhythm.report.sample_size >= 20) {
        let minutes = rhythm.report.median_minutes_per_active_day;
        metrics.push(MetricSpec {
            id: "hours_per_active_day",
            label: "Оценка времени в активный день (медиана)",
            value: i64::from(minutes),
            display: hours_exact(minutes),
            public_display: fsp_domain::hours_band(minutes),
            // Saturates at three hours: longer days are not rewarded; automated volume is not scored.
            score: ramp(f64::from(minutes), 0.0, 180.0),
            weight: if automated { 0 } else { 15 },
        });
    }
    let since = activity.days_since_last;
    metrics.push(MetricSpec {
        id: "days_since_last_activity",
        label: "Дней с последней активности",
        value: since.unwrap_or(-1),
        display: since.map_or_else(|| "нет активности".into(), |days| format!("{days}")),
        public_display: since.map_or_else(
            || "нет активности".into(),
            |days| match days {
                0..=7 => "до недели".into(),
                8..=31 => "до месяца".into(),
                32..=180 => "до полугода".into(),
                _ => "больше полугода".into(),
            },
        ),
        score: since.map_or(0, |days| inverse_ramp(days as f64, 14.0, 180.0)),
        weight: 15,
    });
    dimension(
        GitHubDimensionId::Engagement,
        "Вовлечённость",
        20,
        [
            "Высокая вовлечённость: много активных дней и длинные серии",
            "Заметная вовлечённость",
            "Умеренная вовлечённость",
            "Низкая публичная вовлечённость",
        ],
        metrics,
    )
}

fn longevity_dimension(
    snapshot: &Snapshot,
    activity: &Activity,
    today: NaiveDate,
) -> GitHubDimension {
    let age_years = snapshot.created_at.map_or(0, |created| {
        ((today - created.date_naive()).num_days() / 365) as u32
    });
    dimension(
        GitHubDimensionId::Longevity,
        "Стаж",
        15,
        [
            "Многолетняя устойчивая активность",
            "Несколько лет активности",
            "Небольшой публичный стаж",
            "Публичная история только начинается",
        ],
        vec![
            count_metric(
                "account_age",
                "Возраст аккаунта",
                age_years,
                YEARS,
                ramp(f64::from(age_years), 0.0, 6.0),
                30,
            ),
            count_metric(
                "active_years",
                "Лет с публичным вкладом",
                activity.report.active_years,
                YEARS,
                ramp(f64::from(activity.report.active_years), 0.0, 5.0),
                40,
            ),
            count_metric(
                "sustained_years",
                "Лет с 50+ активными днями",
                activity.sustained_years,
                YEARS,
                ramp(f64::from(activity.sustained_years), 0.0, 4.0),
                30,
            ),
        ],
    )
}

fn collaboration_dimension(collaboration: &Collaboration) -> GitHubDimension {
    let report = &collaboration.report;
    let mut metrics = vec![
        count_metric(
            "peer_validated_pull_requests",
            "PR, принятые или отревьюенные другим человеком",
            collaboration.peer_validated,
            ITEMS,
            log_ramp(f64::from(collaboration.peer_validated), 25.0),
            35,
        ),
        count_metric(
            "reviews_of_others",
            "Ревью в независимых репозиториях",
            collaboration.reviews_of_others,
            ITEMS,
            log_ramp(f64::from(collaboration.reviews_of_others), 50.0),
            25,
        ),
        count_metric(
            "external_repositories",
            "Независимых репозиториев с принятым вкладом",
            report.external_repositories,
            ITEMS,
            ramp(f64::from(report.external_repositories), 0.0, 10.0),
            20,
        ),
        count_metric(
            "external_merged",
            "Принятых PR в независимые репозитории (выборка)",
            report.external_merged,
            ITEMS,
            log_ramp(f64::from(report.external_merged), 25.0),
            20,
        ),
    ];
    if let Some(rate) = report.external_merge_rate_percent {
        metrics.push(percent_metric(
            "external_merge_rate",
            "Доля принятых PR в независимые репозитории",
            rate,
            ramp(f64::from(rate), 30.0, 90.0),
            10,
        ));
    }
    dimension(
        GitHubDimensionId::Collaboration,
        "Совместная работа",
        20,
        [
            "Регулярная работа с другими людьми: ревью и принятые изменения",
            "Есть подтверждённая совместная работа",
            "Совместная работа подтверждается слабо",
            "Публичных следов совместной работы почти нет",
        ],
        metrics,
    )
}

fn craft_dimension(craft: &Craft) -> Option<GitHubDimension> {
    let report = &craft.report;
    if report.substantive_repositories == 0 {
        return None;
    }
    let hygiene = |id, label, value: u8, weight| percent_metric(id, label, value, value, weight);
    let mut metrics = vec![
        hygiene("readme", "Проекты с README", report.readme_percent, 10),
        hygiene("license", "Проекты с лицензией", report.license_percent, 10),
        hygiene("ci", "Проекты с CI", report.ci_percent, 20),
        hygiene("tests", "Проекты с тестами", report.tests_percent, 20),
        hygiene(
            "lockfile",
            "Зафиксированные зависимости",
            report.lockfile_percent,
            10,
        ),
        hygiene("lint", "Линтеры и форматтеры", report.lint_percent, 10),
        hygiene(
            "dependency_updates",
            "Автообновление зависимостей",
            report.dependency_updates_percent,
            5,
        ),
    ];
    if let Some(value) = report.descriptive_messages_percent {
        metrics.push(percent_metric(
            "descriptive_messages",
            "Содержательные сообщения коммитов",
            value,
            value,
            10,
        ));
    }
    if let Some(lines) = report.median_commit_lines {
        // Small reviewable commits score best; tiny or huge medians score less.
        let score = match lines {
            0 => 0,
            1..=4 => 50,
            5..=400 => 100,
            401..=1000 => 60,
            _ => 20,
        };
        metrics.push(MetricSpec {
            id: "median_commit_lines",
            label: "Медианный размер коммита",
            value: i64::from(lines),
            display: format!("{} строк", group(lines)),
            public_display: format!("{} строк", approx(lines)),
            score,
            weight: 5,
        });
    }
    Some(dimension(
        GitHubDimensionId::Craft,
        "Инженерная культура",
        15,
        [
            "Проекты оформлены зрело: CI, тесты, зависимости и стиль",
            "Хорошие инженерные практики в большинстве проектов",
            "Инженерные практики применяются выборочно",
            "Инженерных практик в публичных проектах почти не видно",
        ],
        metrics,
    ))
}

fn impact_dimension(impact: &Impact) -> GitHubDimension {
    dimension(
        GitHubDimensionId::Impact,
        "Признание",
        5,
        [
            "Проекты и вклад широко используются",
            "Заметное признание сообщества",
            "Небольшое признание сообщества",
            "Признание сообщества пока не видно",
        ],
        vec![
            count_metric(
                "maintained_stars",
                "Звёзды основных проектов",
                impact.maintained_stars,
                ITEMS,
                log_ramp(f64::from(impact.maintained_stars), 500.0),
                35,
            ),
            count_metric(
                "owned_forks",
                "Форки собственных проектов",
                impact.owned_forks,
                ITEMS,
                log_ramp(f64::from(impact.owned_forks), 100.0),
                15,
            ),
            count_metric(
                "notable_external",
                "Принятый вклад в независимые проекты от 1000 звёзд",
                impact.notable_external,
                ITEMS,
                ramp(f64::from(impact.notable_external), 0.0, 3.0),
                40,
            ),
            count_metric(
                "followers",
                "Подписчики",
                impact.followers,
                ITEMS,
                log_ramp(f64::from(impact.followers), 200.0),
                10,
            ),
        ],
    )
}

// ---------------------------------------------------------------------------------------------
// Flags, confidence and narrative

fn flags(
    snapshot: &Snapshot,
    activity: &Activity,
    rhythm: Option<&Rhythm>,
    collaboration: &Collaboration,
    craft: &Craft,
) -> Vec<GitHubFlag> {
    let mut flags = Vec::new();
    let mut push = |id: &str, severity, title: &str, detail: String| {
        flags.push(GitHubFlag {
            id: id.into(),
            severity,
            title: title.into(),
            detail,
        });
    };
    let regular = snapshot
        .commits
        .iter()
        .filter(|commit| !commit.is_merge())
        .collect::<Vec<_>>();
    let future = regular
        .iter()
        .filter(|commit| commit.authored_at > snapshot.now + Duration::days(1))
        .count();
    if future > 0 {
        push(
            "future_dated",
            FlagSeverity::Warning,
            "Коммиты из будущего",
            format!("{future} коммитов датированы позже текущего момента: даты задаются вручную."),
        );
    }
    if let Some(rhythm) = rhythm {
        if rhythm.report.sample_size >= 20 && rhythm.top_minute_share >= 40 {
            push(
                "uniform_commit_minute",
                FlagSeverity::Warning,
                "Коммиты в одну и ту же минуту",
                format!(
                    "{}% коммитов выборки сделаны в одну и ту же минуту суток: так выглядит генерация по расписанию.",
                    rhythm.top_minute_share
                ),
            );
        }
        let per_active_day = activity
            .commits_last_year
            .checked_div(activity.report.active_days_last_year)
            .unwrap_or(0);
        let rate = rhythm.median_commits_per_day.max(per_active_day);
        if rate >= AUTOMATION_COMMITS_PER_DAY {
            push(
                "high_commit_rate",
                FlagSeverity::Info,
                "Очень высокий темп коммитов",
                format!(
                    "Около {rate} коммитов в активный день: похоже на автоматизацию или работу AI-агентов. Объём не равен трудозатратам, поэтому оценка часов не входит в индекс."
                ),
            );
        }
    }
    if craft.message_sample >= 20 && craft.repeated_message_share >= 50 {
        push(
            "repeated_messages",
            FlagSeverity::Warning,
            "Одинаковые сообщения коммитов",
            format!(
                "{}% коммитов выборки имеют одно и то же сообщение.",
                craft.repeated_message_share
            ),
        );
    }
    let backdated = regular
        .iter()
        .filter(|commit| commit.committed_at - commit.authored_at > Duration::days(30))
        .count() as u32;
    if regular.len() >= 20 && percent(backdated, regular.len() as u32) >= 50 {
        push(
            "rewritten_history",
            FlagSeverity::Info,
            "Даты авторства сильно раньше дат коммита",
            "Так бывает после rebase, переноса истории или датирования задним числом; активность по дням может быть смещена.".into(),
        );
    }
    let mut by_repository: HashMap<&str, Vec<u32>> = HashMap::new();
    for commit in &regular {
        by_repository
            .entry(commit.repository.as_str())
            .or_default()
            .push(commit.lines());
    }
    // Graph padding: an unknown repository of the account receives most of its commits, almost all
    // of them one- or two-line edits. Popular or independent projects are never treated as padding.
    let led = led_repositories(snapshot);
    if activity.commits_last_year >= 100 {
        for repository in &snapshot.primary {
            let name = repository.reference.name_with_owner.as_str();
            let own = repository
                .reference
                .owner_login
                .eq_ignore_ascii_case(&snapshot.login)
                || led.contains(name);
            let share = percent(repository.contributions, total_commits(snapshot));
            let tiny = by_repository.get(name).is_some_and(|lines| {
                lines.len() >= 30
                    && percent(
                        lines.iter().filter(|value| **value <= 2).count() as u32,
                        lines.len() as u32,
                    ) >= 70
            });
            if own && repository.reference.stars < 10 && share >= 80 && tiny {
                push(
                    "padding_repository",
                    FlagSeverity::Warning,
                    "Активность сосредоточена в одном репозитории из микрокоммитов",
                    "Большая часть вклада — коммиты в 1–2 строки в одном репозитории; такой вклад не учитывается как содержательный.".into(),
                );
                break;
            }
        }
    }
    // GitHub records contributions when commits are pushed; a later history rewrite keeps them.
    let recent_years = snapshot.now.year() - 2;
    let mut window_contributions: HashMap<&str, u32> = HashMap::new();
    for year in snapshot
        .years
        .iter()
        .filter(|year| year.year >= recent_years)
    {
        for item in &year.commit_repositories {
            *window_contributions
                .entry(item.repository.name_with_owner.as_str())
                .or_insert(0) += item.count;
        }
    }
    let inflated = snapshot
        .history_shares
        .iter()
        .filter(|(name, share)| {
            let counted = window_contributions
                .get(name.as_str())
                .copied()
                .unwrap_or(0);
            counted >= 100 && share.authored * 2 < counted
        })
        .count();
    if inflated > 0 {
        push(
            "contributions_exceed_history",
            FlagSeverity::Info,
            "Вклад по счётчику GitHub больше текущей истории",
            format!(
                "В {inflated} репозиториях GitHub насчитал заметно больше коммитов, чем осталось в истории основной ветки: история переписана или изменения сжаты. Размеры и ритм считаются по текущей истории."
            ),
        );
    }
    if let Some(created) = snapshot.created_at
        && (snapshot.now - created).num_days() < 120
        && activity.report.contributions_last_year >= 300
    {
        push(
            "new_account_burst",
            FlagSeverity::Info,
            "Новый аккаунт с большим объёмом",
            "Аккаунту меньше четырёх месяцев; устойчивость активности пока не проверить.".into(),
        );
    }
    let public = activity.report.contributions_last_year;
    let private = snapshot.restricted_last_year;
    if private > 0 && percent(private, public + private) >= 60 {
        push(
            "mostly_private",
            FlagSeverity::Info,
            "Основная работа — в приватных репозиториях",
            format!(
                "GitHub показывает {} приватных вкладов за год против {} публичных. Приватная работа не проверяется и не входит в индекс, поэтому индекс может быть занижен.",
                group(private),
                group(public)
            ),
        );
    }
    let owned = snapshot.owned.len() as u32;
    let forks = snapshot
        .owned
        .iter()
        .filter(|repository| repository.fork)
        .count() as u32;
    if owned >= 10 && percent(forks, owned) >= 70 {
        push(
            "fork_heavy",
            FlagSeverity::Info,
            "Много форков без собственной работы",
            format!("{forks} из {owned} собственных репозиториев — форки; форки не оцениваются."),
        );
    }
    if collaboration.sampled >= 30
        && collaboration.merged_sampled >= 20
        && percent(collaboration.peer_validated, collaboration.sampled) < 5
    {
        push(
            "self_merged_pull_requests",
            FlagSeverity::Info,
            "PR принимаются без внешнего ревью",
            format!(
                "Из {} последних PR другим человеком проверены или приняты {}: совместная работа подтверждается слабо.",
                collaboration.sampled, collaboration.peer_validated
            ),
        );
    }
    if snapshot
        .years
        .iter()
        .any(|year| year.commit_repositories.len() >= 100)
    {
        push(
            "repository_cap",
            FlagSeverity::Info,
            "Вклад в очень многие репозитории",
            "GitHub отдаёт не более 100 репозиториев за год; распределение вклада по остальным неизвестно.".into(),
        );
    }
    if rhythm.is_some_and(|rhythm| !rhythm.report.timezone_inferred) {
        push(
            "timezone_unknown",
            FlagSeverity::Info,
            "Часовой пояс не определён",
            "Время коммитов показано в UTC.".into(),
        );
    }
    if activity.report.active_days_last_year < 10 && snapshot.commits.len() < 10 {
        push(
            "low_public_data",
            FlagSeverity::Info,
            "Мало публичных данных",
            "Публичной активности слишком мало для уверенных выводов; это не оценка навыков."
                .into(),
        );
    }
    flags
}

fn total_commits(snapshot: &Snapshot) -> u32 {
    snapshot.years.iter().map(|year| year.totals.commits).sum()
}

fn confidence(snapshot: &Snapshot, activity: &Activity, flags: &[GitHubFlag]) -> SignalConfidence {
    let sampled = snapshot.commits.len();
    let days = activity.report.active_days_last_year;
    let mut level: u8 = if sampled >= 150 && days >= 60 && activity.report.active_years >= 2 {
        2
    } else if sampled >= 30 && days >= 15 {
        1
    } else {
        0
    };
    // Warnings and automation-like volume mean activity may not reflect the person's own work.
    if flags.iter().any(|flag| {
        flag.severity == FlagSeverity::Warning
            || flag.id == "high_commit_rate"
            || flag.id == "contributions_exceed_history"
    }) {
        level = level.saturating_sub(1);
    }
    if snapshot.partial {
        level = level.min(1);
    }
    match level {
        2 => SignalConfidence::High,
        1 => SignalConfidence::Medium,
        _ => SignalConfidence::Low,
    }
}

fn highlights(
    activity: &Activity,
    collaboration: &Collaboration,
    craft: &Craft,
    impact: &Impact,
    languages: &[GitHubLanguageShare],
) -> Vec<String> {
    let mut items = Vec::new();
    let report = &activity.report;
    if report.active_weeks_last_year >= 10 {
        items.push(format!(
            "Активность около {} из 52 недель за последний год",
            round_to(report.active_weeks_last_year, 5).min(52)
        ));
    }
    if report.longest_daily_streak >= 7 {
        items.push(format!(
            "Самая длинная серия — {} подряд",
            with_unit(
                approx(report.longest_daily_streak),
                approx_value(report.longest_daily_streak),
                DAYS
            )
        ));
    }
    if collaboration.peer_validated > 0 {
        items.push(format!(
            "Изменения, проверенные другими людьми: {}",
            approx(collaboration.peer_validated)
        ));
    }
    if collaboration.reviews_of_others >= 5 {
        items.push(format!(
            "Ревью в независимых репозиториях: {}",
            approx(collaboration.reviews_of_others)
        ));
    }
    if impact.notable_external > 0 {
        items.push("Принятый вклад в крупные независимые open source-проекты".into());
    }
    if craft.report.substantive_repositories >= 2 && craft.report.ci_percent >= 50 {
        items.push(format!(
            "CI настроен примерно в {}% основных проектов",
            round_to(u32::from(craft.report.ci_percent), 10)
        ));
    }
    let main = languages
        .iter()
        .take(2)
        .map(|language| language.name.as_str())
        .collect::<Vec<_>>();
    if !main.is_empty() {
        items.push(format!("Основные языки: {}", main.join(", ")));
    }
    items.truncate(6);
    items
}

fn coverage(snapshot: &Snapshot) -> GitHubCoverage {
    let from = snapshot
        .years
        .first()
        .map(|year| format!("{}-01-01T00:00:00Z", year.year))
        .unwrap_or_else(|| {
            snapshot
                .now
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        });
    GitHubCoverage {
        from,
        to: snapshot
            .now
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        years_analyzed: snapshot.years.len() as u32,
        commit_contributions: total_commits(snapshot),
        commits_sampled: snapshot.commits.len() as u32,
        repositories_analyzed: snapshot.primary.len() as u32,
        timezone_samples: snapshot.timezone_samples.len() as u32,
        partial: snapshot.partial,
        notes: snapshot.notes.clone(),
    }
}

fn organizations(snapshot: &Snapshot) -> GitHubOrganizations {
    let affiliated = affiliated_owners(snapshot);
    let mut contributed: BTreeMap<String, (BTreeSet<String>, u32)> = BTreeMap::new();
    for year in &snapshot.years {
        for item in year
            .commit_repositories
            .iter()
            .chain(&year.pull_request_repositories)
            .chain(&year.review_repositories)
            .chain(&year.issue_repositories)
        {
            if item.repository.owner_is_organization {
                let entry = contributed
                    .entry(item.repository.owner_login.clone())
                    .or_default();
                entry.0.insert(item.repository.name_with_owner.clone());
                entry.1 += item.count;
            }
        }
    }
    let mut contributed = contributed
        .into_iter()
        .map(
            |(login, (repositories, contributions))| GitHubContributedOrganization {
                url: format!("https://github.com/{login}"),
                affiliated: affiliated.contains(&login.to_ascii_lowercase()),
                login,
                repositories: repositories.len() as u32,
                contributions,
            },
        )
        .collect::<Vec<_>>();
    contributed.sort_by(|a, b| {
        b.contributions
            .cmp(&a.contributions)
            .then(a.login.cmp(&b.login))
    });
    contributed.truncate(15);
    GitHubOrganizations {
        memberships: snapshot
            .organizations
            .iter()
            .map(|organization| GitHubOrganization {
                login: organization.login.clone(),
                name: organization.name.clone(),
                url: format!("https://github.com/{}", organization.login),
                members: organization.members,
                public_repositories: organization.public_repositories,
            })
            .collect(),
        contributed,
    }
}

/// Language mix weighted by where the account commits: each primary repository's byte shares are
/// scaled by its commit contributions (owned repositories count at least once).
fn languages(snapshot: &Snapshot) -> Vec<GitHubLanguageShare> {
    let mut weights: BTreeMap<String, f64> = BTreeMap::new();
    for repository in snapshot
        .primary
        .iter()
        .filter(|repository| !repository.reference.fork)
    {
        let total: u64 = repository.languages.iter().map(|(_, size)| size).sum();
        if total == 0 {
            continue;
        }
        let weight = f64::from(repository.contributions.max(1));
        for (language, size) in &repository.languages {
            *weights.entry(language.clone()).or_insert(0.0) +=
                weight * (*size as f64) / (total as f64);
        }
    }
    let sum: f64 = weights.values().sum();
    if sum == 0.0 {
        return Vec::new();
    }
    let mut shares = weights
        .into_iter()
        .map(|(name, weight)| GitHubLanguageShare {
            name,
            percent: (weight / sum * 100.0).round() as u8,
        })
        .filter(|share| share.percent >= 1)
        .collect::<Vec<_>>();
    shares.sort_by(|a, b| b.percent.cmp(&a.percent).then(a.name.cmp(&b.name)));
    shares.truncate(8);
    shares
}

/// Repositories, reasons and the latest push per detected technology.
type TechnologyEvidence = (u32, BTreeSet<String>, Option<DateTime<Utc>>);

fn technologies(snapshot: &Snapshot) -> Vec<GitHubTechnology> {
    let mut found: BTreeMap<&'static str, TechnologyEvidence> = BTreeMap::new();
    for repository in snapshot
        .primary
        .iter()
        .filter(|repository| !repository.reference.fork)
    {
        for (skill, reasons) in tech::detect(repository) {
            let entry = found.entry(skill).or_default();
            entry.0 += 1;
            entry.1.extend(reasons);
            entry.2 = entry.2.max(repository.pushed_at);
        }
    }
    found
        .into_iter()
        .map(
            |(skill, (repositories, reasons, pushed))| GitHubTechnology {
                skill_id: skill.into(),
                repositories,
                signals: reasons.into_iter().take(5).collect(),
                last_pushed_at: pushed
                    .map(|time| time.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
            },
        )
        .collect()
}

fn repositories(snapshot: &Snapshot, craft: &Craft) -> Vec<GitHubRepositoryInsight> {
    let mut sampled: HashMap<&str, u32> = HashMap::new();
    for commit in &snapshot.commits {
        *sampled.entry(commit.repository.as_str()).or_insert(0) += 1;
    }
    snapshot
        .primary
        .iter()
        .map(|repository| {
            let name = repository.reference.name_with_owner.clone();
            GitHubRepositoryInsight {
                url: format!("https://github.com/{name}"),
                owned: repository
                    .reference
                    .owner_login
                    .eq_ignore_ascii_case(&snapshot.login),
                fork: repository.reference.fork,
                archived: repository.archived,
                stars: repository.reference.stars,
                forks: repository.forks,
                primary_language: repository.reference.primary_language.clone(),
                pushed_at: repository
                    .pushed_at
                    .map(|time| time.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
                contributions: repository.contributions,
                sampled_commits: sampled.get(name.as_str()).copied().unwrap_or(0),
                hygiene: craft
                    .hygiene
                    .get(&name)
                    .cloned()
                    .unwrap_or_else(|| hygiene(repository)),
                technologies: tech::detect(repository)
                    .into_keys()
                    .map(str::to_owned)
                    .collect(),
                name_with_owner: name,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Numbers

fn ramp(value: f64, zero: f64, full: f64) -> u8 {
    if full <= zero {
        return 0;
    }
    ((value - zero) / (full - zero) * 100.0)
        .clamp(0.0, 100.0)
        .round() as u8
}

/// Saturating logarithmic scale: `full` and above score 100.
fn log_ramp(value: f64, full: f64) -> u8 {
    if value <= 0.0 {
        return 0;
    }
    ((1.0 + value).ln() / (1.0 + full).ln() * 100.0)
        .clamp(0.0, 100.0)
        .round() as u8
}

/// 100 up to `full_until`, falling linearly to 0 at `zero_at`.
fn inverse_ramp(value: f64, full_until: f64, zero_at: f64) -> u8 {
    100 - ramp(value, full_until, zero_at)
}

pub(crate) fn percent(part: u32, total: u32) -> u8 {
    if total == 0 {
        return 0;
    }
    ((u64::from(part) * 100 + u64::from(total) / 2) / u64::from(total)).min(100) as u8
}

fn median(mut values: Vec<u32>) -> Option<u32> {
    if values.is_empty() {
        return None;
    }
    values.sort_unstable();
    let middle = values.len() / 2;
    Some(if values.len().is_multiple_of(2) {
        (values[middle - 1] + values[middle]) / 2
    } else {
        values[middle]
    })
}

fn round_to(value: u32, step: u32) -> u32 {
    (value + step / 2) / step * step
}

/// Two significant figures for values from 100; nearest five from 10; exact below 10.
fn approx_value(value: u32) -> u32 {
    match value {
        0..=9 => value,
        10..=99 => round_to(value, 5),
        _ => {
            let magnitude = 10u32.pow(value.ilog10() - 1);
            round_to(value, magnitude)
        }
    }
}

fn approx(value: u32) -> String {
    let rounded = approx_value(value);
    if rounded == value && value < 10 {
        group(value)
    } else {
        format!("≈{}", group(rounded))
    }
}

/// Thousands separated by a no-break space, as in Russian typography.
fn group(value: u32) -> String {
    let digits = value.to_string();
    let mut grouped = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            grouped.push('\u{a0}');
        }
        grouped.push(digit);
    }
    grouped
}

fn plural(value: u32, forms: (&str, &str, &str)) -> String {
    let (one, few, many) = forms;
    let tail = value % 100;
    let form = if (11..=14).contains(&tail) {
        many
    } else {
        match value % 10 {
            1 => one,
            2..=4 => few,
            _ => many,
        }
    };
    form.into()
}

fn with_unit(number: String, value: u32, unit: (&str, &str, &str)) -> String {
    if unit.0.is_empty() {
        number
    } else {
        format!("{number} {}", plural(value, unit))
    }
}

fn hours_exact(minutes: u32) -> String {
    format!("{} ч {:02} мин", minutes / 60, minutes % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::{
        DayActivity, HistoryShare, OrganizationFact, PeriodTotals, PullRequestFact,
        RepositoryContribution, TimezoneSample, YearFact,
    };
    use chrono::TimeZone;

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    fn commit(repository: &str, time: DateTime<Utc>, lines: u32, headline: &str) -> CommitFact {
        CommitFact {
            repository: repository.into(),
            oid: format!("{repository}-{}-{lines}-{headline}", time.timestamp()),
            authored_at: time,
            committed_at: time,
            additions: lines,
            deletions: 0,
            headline: headline.into(),
            parents: 1,
            signed: false,
        }
    }

    fn reference(name: &str, stars: u32) -> RepositoryRef {
        let owner = name.split('/').next().unwrap();
        RepositoryRef {
            name_with_owner: name.into(),
            owner_login: owner.into(),
            owner_is_organization: owner != "me",
            fork: false,
            stars,
            primary_language: None,
        }
    }

    fn pull(
        name: &str,
        number: u32,
        merged_by_other: bool,
        merged_by_self: bool,
    ) -> PullRequestFact {
        PullRequestFact {
            url: format!("https://github.com/{name}/pull/{number}"),
            repository: reference(name, 2000),
            created_at: at(2026, 5, 1, 12, 0),
            state: if merged_by_other || merged_by_self {
                PullRequestState::Merged
            } else {
                PullRequestState::Open
            },
            additions: 10,
            deletions: 2,
            merged_by_other,
            merged_by_self,
            reviewed_by_other: false,
        }
    }

    fn base() -> Snapshot {
        Snapshot {
            login: "me".into(),
            now: at(2026, 10, 9, 12, 0),
            created_at: Some(at(2019, 1, 1, 0, 0)),
            ..Snapshot::default()
        }
    }

    #[test]
    fn streaks_count_consecutive_days_and_weeks_including_the_current_one() {
        let days = [
            date(2026, 9, 1),
            date(2026, 9, 2),
            date(2026, 9, 3),
            date(2026, 10, 8),
            date(2026, 10, 9),
        ];
        assert_eq!(runs(&days, 1, date(2026, 10, 9)), (3, 2));
        assert_eq!(runs(&days, 1, date(2026, 10, 12)), (3, 0));
        let weeks = [date(2026, 9, 7), date(2026, 9, 14), date(2026, 9, 28)];
        assert_eq!(runs(&weeks, 7, date(2026, 10, 5)), (2, 1));
    }

    #[test]
    fn burstiness_separates_steady_from_bursty_weeks() {
        assert!(burstiness(&[5; 52]) < 0);
        let mut bursty = vec![0; 52];
        bursty[10] = 200;
        assert!(burstiness(&bursty) > 70);
    }

    #[test]
    fn rhythm_uses_the_author_offset_and_joins_close_commits_into_sessions() {
        // Mondays at 05:00 and 05:40 UTC are 10:00 and 10:40 at UTC+5: one 70-minute session.
        // 2026-01-05 is a Monday.
        let mut commits = Vec::new();
        for week in 0..10 {
            let monday = at(2026, 1, 5, 5, 0) + Duration::weeks(week);
            commits.push(commit("me/a", monday, 10, "feat: one"));
            commits.push(commit(
                "me/a",
                monday + Duration::minutes(40),
                10,
                "feat: two",
            ));
        }
        let samples = [TimezoneSample {
            at: at(2026, 1, 5, 5, 0),
            offset_minutes: 300,
        }];
        let rhythm = Rhythm::compute(&commits, &samples).unwrap();
        assert!(rhythm.report.timezone_inferred);
        assert_eq!(rhythm.report.hourly_percent[10], 100);
        assert_eq!(rhythm.report.office_hours_percent, 100);
        assert_eq!(rhythm.report.weekend_percent, 0);
        assert_eq!(
            rhythm.report.median_minutes_per_active_day,
            40 + FIRST_COMMIT_MINUTES as u32
        );
        assert_eq!(rhythm.report.sessions_per_active_day_tenths, 10);
        assert_eq!(rhythm.report.active_days, 10);
    }

    #[test]
    fn commit_messages_are_classified_conservatively() {
        assert!(is_conventional("feat(api): add search"));
        assert!(is_conventional("fix!: drop legacy flag"));
        assert!(!is_conventional("feature: add search"));
        assert!(!is_conventional("fix:no space"));
        assert!(is_descriptive(
            "Bound inbound request bodies before allocating"
        ));
        assert!(!is_descriptive("Update README.md"));
        assert!(!is_descriptive("wip"));
        assert!(!is_descriptive("small fix"));
    }

    #[test]
    fn own_organizations_never_count_as_independent_collaboration() {
        let mut snapshot = base();
        snapshot.organizations = vec![OrganizationFact {
            login: "member-org".into(),
            ..OrganizationFact::default()
        }];
        snapshot.years = vec![YearFact {
            year: 2026,
            commit_repositories: [
                "writer/a",
                "writer/b",
                "writer/c",
                "oss/lib",
                "member-org/x",
            ]
            .iter()
            .map(|name| RepositoryContribution {
                repository: reference(name, 5000),
                count: 5,
            })
            .collect(),
            ..YearFact::default()
        }];
        snapshot.pull_requests = vec![
            pull("self-merged/tool", 1, false, true),
            pull("oss/lib", 2, true, false),
            pull("member-org/x", 3, true, false),
            pull("writer/a", 4, true, false),
        ];
        let collaboration = Collaboration::compute(&snapshot);
        // Every pull request merged by another human is peer-validated wherever it lives …
        assert_eq!(collaboration.peer_validated, 3);
        // … but only `oss/lib` is independent: membership, self-merge and organization-wide
        // write access (three or more repositories) make the other owners the account's own.
        assert_eq!(collaboration.report.external_pull_requests, 1);
        assert_eq!(collaboration.report.external_merged, 1);
        assert_eq!(collaboration.report.external_repositories, 1);
        assert_eq!(collaboration.report.affiliated_organizations, 3);
        assert_eq!(
            collaboration
                .report
                .notable_contributions
                .iter()
                .map(|item| item.repository.as_str())
                .collect::<Vec<_>>(),
            ["oss/lib"]
        );
    }

    #[test]
    fn repositories_led_by_the_account_are_its_own_work() {
        let mut snapshot = base();
        snapshot.years = vec![YearFact {
            year: 2026,
            commit_repositories: vec![RepositoryContribution {
                repository: reference("team/led", 3000),
                count: 60,
            }],
            ..YearFact::default()
        }];
        snapshot.history_shares = BTreeMap::from([(
            "team/led".to_owned(),
            HistoryShare {
                authored: 60,
                total: 90,
            },
        )]);
        let collaboration = Collaboration::compute(&snapshot);
        assert_eq!(collaboration.report.external_repositories, 0);
        assert!(collaboration.report.notable_contributions.is_empty());
    }

    #[test]
    fn graph_padding_and_generated_history_are_flagged_and_lower_confidence() {
        let mut snapshot = base();
        let start = at(2026, 3, 2, 9, 15);
        snapshot.commits = (0..60)
            .map(|day| commit("me/green", start + Duration::days(day), 1, "update"))
            .collect();
        snapshot.primary = vec![PrimaryRepository {
            reference: reference("me/green", 0),
            contributions: 300,
            ..PrimaryRepository::default()
        }];
        snapshot.years = vec![YearFact {
            year: 2026,
            totals: PeriodTotals {
                commits: 300,
                ..PeriodTotals::default()
            },
            ..YearFact::default()
        }];
        for day in 0..200 {
            snapshot.days.insert(
                date(2026, 1, 1) + Duration::days(day),
                DayActivity {
                    commits: 1,
                    ..DayActivity::default()
                },
            );
        }
        let report = build_report(&snapshot);
        let ids = report
            .flags
            .iter()
            .map(|flag| flag.id.as_str())
            .collect::<Vec<_>>();
        assert!(ids.contains(&"padding_repository"), "{ids:?}");
        assert!(ids.contains(&"uniform_commit_minute"), "{ids:?}");
        assert!(ids.contains(&"repeated_messages"), "{ids:?}");
        assert_eq!(report.index.confidence, SignalConfidence::Low);

        // The same pattern in a popular project of another owner is not padding.
        snapshot.primary[0].reference = reference("kernel/linux", 200_000);
        for commit in &mut snapshot.commits {
            commit.repository = "kernel/linux".into();
        }
        let report = build_report(&snapshot);
        assert!(
            !report
                .flags
                .iter()
                .any(|flag| flag.id == "padding_repository")
        );
    }

    #[test]
    fn scores_saturate_and_counts_are_rounded_for_employers() {
        assert_eq!(log_ramp(1_000_000.0, 1000.0), 100);
        assert_eq!(log_ramp(0.0, 1000.0), 0);
        assert_eq!(ramp(20.0, 0.0, 40.0), 50);
        assert_eq!(inverse_ramp(7.0, 14.0, 180.0), 100);
        assert_eq!(inverse_ramp(400.0, 14.0, 180.0), 0);
        assert_eq!(approx(7), "7");
        assert_eq!(approx(43), "≈45");
        assert_eq!(approx(1234), "≈1\u{a0}200");
        assert_eq!(group(20229), "20\u{a0}229");
        assert_eq!(plural(21, DAYS), "день");
        assert_eq!(plural(12, DAYS), "дней");
        assert_eq!(plural(3, DAYS), "дня");
    }

    #[test]
    fn employer_projection_hides_identity_and_fingerprints() {
        let mut snapshot = base();
        snapshot.organizations = vec![OrganizationFact {
            login: "secret-org".into(),
            ..OrganizationFact::default()
        }];
        snapshot.days.insert(
            date(2026, 10, 1),
            DayActivity {
                commits: 1234,
                ..DayActivity::default()
            },
        );
        let report = build_report(&snapshot);
        let signal = serde_json::to_string(&report.employer_signal(false)).unwrap();
        for hidden in [
            "\"me\"",
            "github.com",
            "secret-org",
            "calendar",
            "1234",
            "1\u{a0}234",
        ] {
            assert!(!signal.contains(hidden), "{hidden} leaked: {signal}");
        }
        assert!(signal.contains("≈1\u{a0}200"));
    }
}
