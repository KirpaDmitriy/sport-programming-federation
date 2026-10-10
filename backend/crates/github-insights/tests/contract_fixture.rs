//! Golden contract fixtures: a representative report and its employer projection, written to
//! `contracts/fixtures/`. The mock suite validates them against the OpenAPI schemas, so the Rust
//! serialization and the contract cannot drift apart. Regenerate with `FSP_UPDATE_FIXTURES=1`.

use std::collections::BTreeMap;
use std::path::PathBuf;

use chrono::{Duration, NaiveDate, TimeZone, Utc};
use fsp_github_insights::analysis::build_report;
use fsp_github_insights::snapshot::{
    CommitFact, DayActivity, HistoryShare, OrganizationFact, OwnedRepository, PeriodTotals,
    PrimaryRepository, PullRequestFact, PullRequestState, RepositoryContribution, RepositoryRef,
    Snapshot, TimezoneSample, YearFact,
};

fn reference(name: &str, stars: u32, organization: bool) -> RepositoryRef {
    RepositoryRef {
        name_with_owner: name.into(),
        owner_login: name.split('/').next().unwrap().into(),
        owner_is_organization: organization,
        fork: false,
        stars,
        primary_language: Some("Rust".into()),
    }
}

fn snapshot() -> Snapshot {
    let now = Utc.with_ymd_and_hms(2026, 10, 9, 12, 0, 0).unwrap();
    let start = NaiveDate::from_ymd_opt(2025, 10, 10).unwrap();
    let days = (0..365)
        .filter(|offset| offset % 7 < 5 && offset % 11 != 0)
        .map(|offset| {
            (
                start + Duration::days(offset),
                DayActivity {
                    commits: (offset % 4) as u32 + 1,
                    pull_requests: u32::from(offset % 13 == 0),
                    reviews: u32::from(offset % 17 == 0),
                    issues: 0,
                },
            )
        })
        .collect::<BTreeMap<_, _>>();
    let commits = (0..120)
        .map(|index| {
            let at = Utc.with_ymd_and_hms(2026, 3, 2, 6, 0, 0).unwrap()
                + Duration::days(index / 2)
                + Duration::minutes(45 * (index % 2));
            CommitFact {
                repository: "dev/service".into(),
                oid: format!("{index:040x}"),
                authored_at: at,
                committed_at: at,
                additions: 30 + (index as u32 % 40),
                deletions: 5,
                headline: format!("feat(api): handle case {index}"),
                parents: 1,
                signed: index % 3 == 0,
            }
        })
        .collect();
    Snapshot {
        login: "dev".into(),
        created_at: Some(Utc.with_ymd_and_hms(2019, 5, 1, 0, 0, 0).unwrap()),
        now,
        followers: 40,
        organizations: vec![OrganizationFact {
            login: "team".into(),
            name: Some("Team".into()),
            members: 12,
            public_repositories: 7,
        }],
        years: vec![YearFact {
            year: 2026,
            totals: PeriodTotals {
                commits: 400,
                pull_requests: 30,
                reviews: 25,
                issues: 4,
            },
            restricted: 60,
            commit_repositories: vec![
                RepositoryContribution {
                    repository: reference("dev/service", 25, false),
                    count: 360,
                },
                RepositoryContribution {
                    repository: reference("oss/engine", 4200, true),
                    count: 40,
                },
            ],
            pull_request_repositories: Vec::new(),
            review_repositories: vec![RepositoryContribution {
                repository: reference("oss/engine", 4200, true),
                count: 25,
            }],
            issue_repositories: Vec::new(),
        }],
        days,
        restricted_last_year: 60,
        owned: vec![OwnedRepository {
            name_with_owner: "dev/service".into(),
            stars: 25,
            forks: 4,
            ..OwnedRepository::default()
        }],
        owned_total: 1,
        primary: vec![PrimaryRepository {
            reference: reference("dev/service", 25, false),
            contributions: 360,
            pushed_at: Some(now),
            forks: 4,
            has_description: true,
            license: Some("MIT".into()),
            topics: vec!["postgresql".into()],
            languages: vec![("Rust".into(), 9000), ("Dockerfile".into(), 200)],
            root: vec![
                ("README.md".into(), false),
                ("Cargo.lock".into(), false),
                ("tests".into(), true),
                ("rustfmt.toml".into(), false),
            ],
            github_dir: vec!["dependabot.yml".into()],
            workflows: 2,
            cargo_manifest: Some("[dependencies]\nredis = \"0.27\"\n".into()),
            ..PrimaryRepository::default()
        }],
        pull_requests: vec![PullRequestFact {
            url: "https://github.com/oss/engine/pull/1".into(),
            repository: reference("oss/engine", 4200, true),
            created_at: now - Duration::days(20),
            state: PullRequestState::Merged,
            additions: 80,
            deletions: 12,
            merged_by_other: true,
            merged_by_self: false,
            reviewed_by_other: true,
        }],
        pull_requests_total: 30,
        commits,
        history_shares: BTreeMap::from([(
            "dev/service".into(),
            HistoryShare {
                authored: 120,
                total: 130,
            },
        )]),
        timezone_samples: vec![TimezoneSample {
            at: Utc.with_ymd_and_hms(2026, 3, 2, 6, 0, 0).unwrap(),
            offset_minutes: 180,
        }],
        ..Snapshot::default()
    }
}

fn check(name: &str, value: &serde_json::Value) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../contracts/fixtures")
        .join(name);
    let rendered = format!("{}\n", serde_json::to_string_pretty(value).unwrap());
    if std::env::var_os("FSP_UPDATE_FIXTURES").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, rendered).unwrap();
        return;
    }
    let stored = std::fs::read_to_string(&path).unwrap_or_default();
    assert_eq!(
        stored, rendered,
        "{name} is stale; regenerate with FSP_UPDATE_FIXTURES=1"
    );
}

#[test]
fn contract_fixtures_match_the_serialized_report() {
    let report = build_report(&snapshot());
    assert!(report.rhythm.is_some());
    assert!(!report.repositories.is_empty());
    check(
        "github-report.json",
        &serde_json::to_value(&report).unwrap(),
    );
    check(
        "github-signal.json",
        &serde_json::to_value(report.employer_signal(true)).unwrap(),
    );
}
