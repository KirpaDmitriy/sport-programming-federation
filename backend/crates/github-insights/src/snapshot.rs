//! Normalized public facts collected for one account. Heuristics read only this structure, so they
//! are pure and testable without GitHub.
//!
//! Everything here comes from public repositories. Private work appears only as the count GitHub
//! itself publishes (`restricted_last_year`), and it is never scored: it cannot be verified.

use std::collections::BTreeMap;

use chrono::{DateTime, NaiveDate, Utc};

#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub login: String,
    pub created_at: Option<DateTime<Utc>>,
    pub now: DateTime<Utc>,
    pub followers: u32,
    /// Public organization memberships.
    pub organizations: Vec<OrganizationFact>,
    pub years: Vec<YearFact>,
    /// Public contributions per UTC day.
    pub days: BTreeMap<NaiveDate, DayActivity>,
    /// Private contributions GitHub shows on the profile for the last year, when the owner allows it.
    pub restricted_last_year: u32,
    pub owned: Vec<OwnedRepository>,
    pub owned_total: u32,
    /// Public repositories, owned or not, where the account commits the most.
    pub primary: Vec<PrimaryRepository>,
    /// The most recent authored pull requests, any public repository.
    pub pull_requests: Vec<PullRequestFact>,
    pub pull_requests_total: u32,
    /// Authored pull requests into public repositories of other owners (search).
    pub external_pull_requests: Vec<PullRequestFact>,
    pub external_pull_requests_total: u32,
    pub commits: Vec<CommitFact>,
    /// Authored and total default-branch commits per analyzed repository in the history window.
    pub history_shares: BTreeMap<String, HistoryShare>,
    pub timezone_samples: Vec<TimezoneSample>,
    pub partial: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OrganizationFact {
    pub login: String,
    pub name: Option<String>,
    pub members: u32,
    pub public_repositories: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DayActivity {
    pub commits: u32,
    pub pull_requests: u32,
    pub reviews: u32,
    pub issues: u32,
}

impl DayActivity {
    pub fn total(self) -> u32 {
        self.commits + self.pull_requests + self.reviews + self.issues
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PeriodTotals {
    pub commits: u32,
    pub pull_requests: u32,
    pub reviews: u32,
    pub issues: u32,
}

#[derive(Debug, Clone, Default)]
pub struct YearFact {
    pub year: i32,
    /// Public totals: GitHub's totals minus contributions to private repositories.
    pub totals: PeriodTotals,
    /// Private contributions GitHub publishes as a bare count for this year.
    pub restricted: u32,
    pub commit_repositories: Vec<RepositoryContribution>,
    pub pull_request_repositories: Vec<RepositoryContribution>,
    pub review_repositories: Vec<RepositoryContribution>,
    pub issue_repositories: Vec<RepositoryContribution>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RepositoryRef {
    pub name_with_owner: String,
    pub owner_login: String,
    pub owner_is_organization: bool,
    pub fork: bool,
    pub stars: u32,
    pub primary_language: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RepositoryContribution {
    pub repository: RepositoryRef,
    pub count: u32,
}

#[derive(Debug, Clone, Default)]
pub struct OwnedRepository {
    pub name_with_owner: String,
    pub fork: bool,
    pub archived: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub pushed_at: Option<DateTime<Utc>>,
    pub stars: u32,
    pub forks: u32,
    pub disk_kib: u32,
}

#[derive(Debug, Clone, Default)]
pub struct PrimaryRepository {
    pub reference: RepositoryRef,
    /// Public commit contributions of the account in the analyzed years.
    pub contributions: u32,
    pub archived: bool,
    pub template: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub pushed_at: Option<DateTime<Utc>>,
    pub forks: u32,
    pub has_description: bool,
    pub license: Option<String>,
    pub topics: Vec<String>,
    pub languages: Vec<(String, u64)>,
    /// Root entries: name and whether the entry is a directory.
    pub root: Vec<(String, bool)>,
    pub github_dir: Vec<String>,
    pub workflows: u32,
    pub cargo_manifest: Option<String>,
    pub npm_manifest: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PullRequestState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone)]
pub struct PullRequestFact {
    pub url: String,
    pub repository: RepositoryRef,
    pub created_at: DateTime<Utc>,
    pub state: PullRequestState,
    pub additions: u32,
    pub deletions: u32,
    /// Merged by a different human account.
    pub merged_by_other: bool,
    /// Merged by the author: the author has merge rights in the repository.
    pub merged_by_self: bool,
    /// Reviewed by at least one different human account.
    pub reviewed_by_other: bool,
}

#[derive(Debug, Clone)]
pub struct CommitFact {
    pub repository: String,
    pub oid: String,
    pub authored_at: DateTime<Utc>,
    pub committed_at: DateTime<Utc>,
    pub additions: u32,
    pub deletions: u32,
    pub headline: String,
    pub parents: u32,
    pub signed: bool,
}

impl CommitFact {
    pub fn lines(&self) -> u32 {
        self.additions.saturating_add(self.deletions)
    }

    pub fn is_merge(&self) -> bool {
        self.parents > 1
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct HistoryShare {
    pub authored: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimezoneSample {
    pub at: DateTime<Utc>,
    pub offset_minutes: i32,
}
