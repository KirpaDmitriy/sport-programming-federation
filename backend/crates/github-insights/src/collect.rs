//! Collects a [`Snapshot`] of public facts within a deadline.
//!
//! Stages: the profile first (node id, contribution years), then contribution years, owned
//! repositories, pull requests and public organizations in parallel, then details and commit
//! histories of the primary repositories in parallel, and finally a monthly sample of commit time
//! zones. A stage that misses its deadline keeps what it has and marks the snapshot partial.
//!
//! Only public repositories are kept, whatever the token can see: every repository reference is
//! filtered by `isPrivate`, organizations come from the public-membership REST endpoint, and daily
//! activity is rebuilt from public contributions instead of the profile calendar (which also counts
//! private work).

use std::collections::{BTreeMap, HashSet};
use std::future::Future;
use std::task::Poll;
use std::time::Duration;

use chrono::{DateTime, Datelike, Months, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::json;
use tokio::time::Instant;

use crate::client::{FetchError, GitHubClient};
use crate::snapshot::{
    CommitFact, DayActivity, HistoryShare, OrganizationFact, OwnedRepository, PeriodTotals,
    PrimaryRepository, PullRequestFact, PullRequestState, RepositoryContribution, RepositoryRef,
    Snapshot, TimezoneSample, YearFact,
};

#[derive(Debug, Clone)]
pub struct Limits {
    pub deadline: Duration,
    pub max_years: usize,
    pub owned_pages: usize,
    pub pull_request_pages: usize,
    pub primary_repositories: usize,
    pub history_years: u32,
    pub timezone_samples: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            deadline: Duration::from_secs(38),
            max_years: 10,
            owned_pages: 3,
            pull_request_pages: 2,
            primary_repositories: 24,
            history_years: 3,
            timezone_samples: 24,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CollectError {
    UnknownAccount,
    Fetch(FetchError),
}

/// The collected snapshot plus whether the ownership code appeared in the profile bio.
pub struct Collected {
    pub snapshot: Snapshot,
    pub ownership_code_found: Option<bool>,
}

/// Reads only the bio and reports whether it contains the ownership code.
pub async fn ownership_code_found(
    client: &GitHubClient,
    login: &str,
    code: &str,
) -> Result<bool, CollectError> {
    let data: BioData = client
        .graphql(BIO_QUERY, json!({ "login": login }))
        .await
        .map_err(account_error)?;
    let user = data.user.ok_or(CollectError::UnknownAccount)?;
    Ok(user.bio.as_deref().is_some_and(|bio| bio.contains(code)))
}

pub async fn collect(
    client: &GitHubClient,
    login: &str,
    ownership_code: Option<&str>,
    limits: &Limits,
) -> Result<Collected, CollectError> {
    let started = Instant::now();
    let profile: ProfileData = client
        .graphql(PROFILE_QUERY, json!({ "login": login }))
        .await
        .map_err(account_error)?;
    let user = profile.user.ok_or(CollectError::UnknownAccount)?;
    let ownership_code_found =
        ownership_code.map(|code| user.bio.as_deref().is_some_and(|bio| bio.contains(code)));
    let now = Utc::now();
    let mut snapshot = Snapshot {
        login: user.login.clone(),
        created_at: parse_time(&user.created_at),
        now,
        followers: user.followers.total_count,
        restricted_last_year: user.contributions_collection.restricted_contributions_count,
        owned_total: user.repositories.total_count,
        ..Snapshot::default()
    };
    let mut years = user.contributions_collection.contribution_years;
    years.sort_unstable_by(|a, b| b.cmp(a));
    if years.len() > limits.max_years {
        snapshot.notes.push(format!(
            "Проанализированы последние {} лет активности из {}.",
            limits.max_years,
            years.len()
        ));
        years.truncate(limits.max_years);
    }

    // Pull requests are not needed to choose repositories, so they load alongside everything else.
    let login = snapshot.login.clone();
    let final_deadline = started + limits.deadline;
    let pull_requests = bounded(
        final_deadline,
        fetch_pull_requests(client, &login, limits.pull_request_pages),
    );
    // Organizations, then the external pull request search excluding them.
    let social = async {
        let organizations = bounded(
            started + limits.deadline.mul_f32(0.5),
            fetch_organizations(client, &login),
        )
        .await;
        let excluded = match &organizations {
            Some(Ok(items)) => items
                .iter()
                .map(|organization| (organization.login.clone(), true))
                .collect(),
            _ => Vec::new(),
        };
        let external = bounded(
            final_deadline,
            fetch_external_pull_requests(client, &login, excluded),
        )
        .await;
        (organizations, external)
    };
    let pipeline = async {
        // Stage 2: what selects the primary repositories.
        let stage_two = started + limits.deadline.mul_f32(0.55);
        let year_futures = years
            .iter()
            .map(|year| bounded(stage_two, fetch_year(client, &login, *year)));
        let (year_results, owned) = tokio::join!(
            join_all(year_futures),
            bounded(stage_two, fetch_owned(client, &login, limits.owned_pages)),
        );
        let mut truncated_days = false;
        for result in year_results {
            match result {
                Some(Ok((year, days, truncated))) => {
                    snapshot.years.push(year);
                    truncated_days |= truncated;
                    for (date, activity) in days {
                        let entry = snapshot.days.entry(date).or_default();
                        entry.commits += activity.commits;
                        entry.pull_requests += activity.pull_requests;
                        entry.reviews += activity.reviews;
                        entry.issues += activity.issues;
                    }
                }
                Some(Err(FetchError::RateLimited {
                    retry_after_seconds,
                })) => {
                    return Err(CollectError::Fetch(FetchError::RateLimited {
                        retry_after_seconds,
                    }));
                }
                other => {
                    log_miss("year", &other);
                    snapshot.partial = true;
                }
            }
        }
        if truncated_days {
            snapshot.notes.push(
                "В репозиториях с более чем 100 активными днями за год GitHub отдаёт только 100 дней; итоговые счётчики точные."
                    .into(),
            );
        }
        snapshot.years.sort_by_key(|year| year.year);
        log_miss("owned", &owned);
        match owned {
            Some(Ok((repositories, complete))) => {
                snapshot.owned = repositories;
                if !complete {
                    snapshot.notes.push(format!(
                        "Учтены {} последних обновлённых собственных репозиториев из {}.",
                        snapshot.owned.len(),
                        snapshot.owned_total
                    ));
                }
            }
            _ => snapshot.partial = true,
        }

        // Stage 3: details and commit histories of the primary repositories. Each batch has its
        // own deadline, so one slow repository does not discard the others.
        let stage_three = started + limits.deadline.mul_f32(0.88);
        let targets = primary_targets(&snapshot, limits.primary_repositories);
        let since = now
            .checked_sub_months(Months::new(12 * limits.history_years))
            .unwrap_or(now);
        let detail_batches = targets
            .chunks(4)
            .map(|chunk| bounded(stage_three, fetch_details(client, chunk.to_vec())));
        let history_batches = targets.chunks(2).map(|chunk| {
            bounded(
                stage_three,
                fetch_histories(client, chunk.to_vec(), &user.id, since),
            )
        });
        let (details, histories) =
            tokio::join!(join_all(detail_batches), join_all(history_batches));
        let contributions = commit_contributions(&snapshot);
        for batch in details {
            log_miss("details", &batch);
            match batch {
                Some(Ok(items)) => snapshot.primary.extend(items),
                _ => snapshot.partial = true,
            }
        }
        for repository in &mut snapshot.primary {
            repository.contributions = contributions
                .get(&repository.reference.name_with_owner)
                .copied()
                .unwrap_or(0);
        }
        snapshot
            .primary
            .sort_by_key(|repository| std::cmp::Reverse(repository.contributions));
        let mut seen = HashSet::new();
        for batch in histories {
            log_miss("history", &batch);
            match batch {
                Some(Ok((commits, shares))) => {
                    snapshot.commits.extend(
                        commits
                            .into_iter()
                            .filter(|commit| seen.insert(commit.oid.clone())),
                    );
                    snapshot.history_shares.extend(shares);
                }
                _ => snapshot.partial = true,
            }
        }
        snapshot.commits.sort_by_key(|commit| commit.authored_at);

        // Stage 4: one small commit per month keeps the author's UTC offset over time.
        let samples = timezone_targets(&snapshot.commits, limits.timezone_samples);
        let sample_futures = samples.into_iter().map(|commit| async move {
            bounded(
                final_deadline,
                client.commit_offset_minutes(&commit.repository, &commit.oid),
            )
            .await
            .and_then(Result::ok)
            .flatten()
            .map(|offset_minutes| TimezoneSample {
                at: commit.authored_at,
                offset_minutes,
            })
        });
        snapshot.timezone_samples = join_all(sample_futures)
            .await
            .into_iter()
            .flatten()
            .collect();
        Ok(())
    };
    let (pull_requests, (organizations, external), pipeline) =
        tokio::join!(pull_requests, social, pipeline);
    pipeline?;
    log_miss("organizations", &organizations);
    match organizations {
        Some(Ok(items)) => snapshot.organizations = items,
        _ => snapshot.partial = true,
    }
    log_miss("external_pull_requests", &external);
    match external {
        Some(Ok((items, total))) => {
            snapshot.external_pull_requests = items;
            snapshot.external_pull_requests_total = total;
        }
        _ => snapshot.partial = true,
    }
    log_miss("pull_requests", &pull_requests);
    match pull_requests {
        Some(Ok((items, total))) => {
            snapshot.pull_requests = items;
            snapshot.pull_requests_total = total;
        }
        _ => snapshot.partial = true,
    }
    if snapshot.partial {
        snapshot.notes.push(
            "Часть данных GitHub не успела загрузиться: показатели рассчитаны по доступной выборке."
                .into(),
        );
    }
    Ok(Collected {
        snapshot,
        ownership_code_found,
    })
}

/// Logs a stage that missed its deadline or failed; the account is not logged.
fn log_miss<T>(stage: &'static str, result: &Option<Result<T, FetchError>>) {
    match result {
        Some(Ok(_)) => {}
        Some(Err(error)) => tracing::warn!(stage, ?error, "github stage failed"),
        None => tracing::warn!(stage, "github stage missed its deadline"),
    }
}

fn account_error(error: FetchError) -> CollectError {
    match error {
        FetchError::NotFound => CollectError::UnknownAccount,
        other => CollectError::Fetch(other),
    }
}

async fn bounded<F: Future>(deadline: Instant, future: F) -> Option<F::Output> {
    tokio::time::timeout_at(deadline, future).await.ok()
}

/// Polls all futures together; the client's semaphore bounds the real request concurrency.
async fn join_all<F: Future>(futures: impl IntoIterator<Item = F>) -> Vec<F::Output> {
    let mut futures = futures.into_iter().map(Box::pin).collect::<Vec<_>>();
    let mut output = futures.iter().map(|_| None).collect::<Vec<_>>();
    std::future::poll_fn(|context| {
        let mut pending = false;
        for (future, slot) in futures.iter_mut().zip(output.iter_mut()) {
            if slot.is_none() {
                match future.as_mut().poll(context) {
                    Poll::Ready(value) => *slot = Some(value),
                    Poll::Pending => pending = true,
                }
            }
        }
        if pending {
            Poll::Pending
        } else {
            Poll::Ready(())
        }
    })
    .await;
    output.into_iter().flatten().collect()
}

type YearResult = (YearFact, BTreeMap<NaiveDate, DayActivity>, bool);

async fn fetch_year(
    client: &GitHubClient,
    login: &str,
    year: i32,
) -> Result<YearResult, FetchError> {
    let variables = json!({
        "login": login,
        "from": format!("{year}-01-01T00:00:00Z"),
        "to": format!("{year}-12-31T23:59:59Z"),
    });
    let (commits, others) = tokio::join!(
        client.graphql::<YearCommitData>(&YEAR_COMMITS_QUERY, variables.clone()),
        client.graphql::<YearOtherData>(&YEAR_OTHER_QUERY, variables),
    );
    let commits = commits?
        .user
        .ok_or(FetchError::NotFound)?
        .contributions_collection;
    let others = others?
        .user
        .ok_or(FetchError::NotFound)?
        .contributions_collection;
    let mut days: BTreeMap<NaiveDate, DayActivity> = BTreeMap::new();
    let mut truncated = false;
    let mut private = PeriodTotals::default();
    let mut add_days = |items: &[ByRepository], kind: fn(&mut DayActivity, u32)| {
        for item in items.iter().filter(|item| !item.repository.is_private) {
            let nodes = &item.contributions.nodes;
            truncated |= (nodes.len() as u32) < item.contributions.total_count;
            for node in nodes.iter().flatten() {
                // Commit days arrive as the start of the contribution day; others as event times.
                let Some(date) = node
                    .occurred_at
                    .get(..10)
                    .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                else {
                    continue;
                };
                if date.year() == year {
                    kind(
                        days.entry(date).or_default(),
                        node.commit_count.unwrap_or(1),
                    );
                }
            }
        }
    };
    add_days(&commits.commit_contributions_by_repository, |day, n| {
        day.commits += n;
    });
    add_days(
        &others.pull_request_contributions_by_repository,
        |day, n| {
            day.pull_requests += n;
        },
    );
    add_days(
        &others.pull_request_review_contributions_by_repository,
        |day, n| day.reviews += n,
    );
    add_days(&others.issue_contributions_by_repository, |day, n| {
        day.issues += n;
    });
    let private_count = |items: &[ByRepository]| -> u32 {
        items
            .iter()
            .filter(|item| item.repository.is_private)
            .map(|item| item.contributions.total_count)
            .sum()
    };
    private.commits = private_count(&commits.commit_contributions_by_repository);
    private.pull_requests = private_count(&others.pull_request_contributions_by_repository);
    private.reviews = private_count(&others.pull_request_review_contributions_by_repository);
    private.issues = private_count(&others.issue_contributions_by_repository);
    let year_fact = YearFact {
        year,
        restricted: commits.restricted_contributions_count,
        totals: PeriodTotals {
            commits: commits
                .total_commit_contributions
                .saturating_sub(private.commits),
            pull_requests: others
                .total_pull_request_contributions
                .saturating_sub(private.pull_requests),
            reviews: others
                .total_pull_request_review_contributions
                .saturating_sub(private.reviews),
            issues: others
                .total_issue_contributions
                .saturating_sub(private.issues),
        },
        commit_repositories: public_contributions(commits.commit_contributions_by_repository),
        pull_request_repositories: public_contributions(
            others.pull_request_contributions_by_repository,
        ),
        review_repositories: public_contributions(
            others.pull_request_review_contributions_by_repository,
        ),
        issue_repositories: public_contributions(others.issue_contributions_by_repository),
    };
    Ok((year_fact, days, truncated))
}

async fn fetch_owned(
    client: &GitHubClient,
    login: &str,
    pages: usize,
) -> Result<(Vec<OwnedRepository>, bool), FetchError> {
    let mut repositories = Vec::new();
    let mut after: Option<String> = None;
    for _ in 0..pages {
        let data: OwnedData = client
            .graphql(OWNED_QUERY, json!({ "login": login, "after": after }))
            .await?;
        let connection = data.user.ok_or(FetchError::NotFound)?.repositories;
        repositories.extend(
            connection
                .nodes
                .into_iter()
                .flatten()
                .filter(|node| !node.is_private)
                .map(|node| OwnedRepository {
                    name_with_owner: node.name_with_owner,
                    fork: node.is_fork,
                    archived: node.is_archived,
                    created_at: parse_time(&node.created_at),
                    pushed_at: node.pushed_at.as_deref().and_then(parse_time),
                    stars: node.stargazer_count,
                    forks: node.fork_count,
                    disk_kib: node.disk_usage.unwrap_or(0),
                }),
        );
        if !connection.page_info.has_next_page {
            return Ok((repositories, true));
        }
        after = connection.page_info.end_cursor;
    }
    Ok((repositories, false))
}

async fn fetch_pull_requests(
    client: &GitHubClient,
    login: &str,
    pages: usize,
) -> Result<(Vec<PullRequestFact>, u32), FetchError> {
    let mut items = Vec::new();
    let mut total = 0;
    let mut after: Option<String> = None;
    for _ in 0..pages {
        let data: PullRequestData = client
            .graphql(
                PULL_REQUEST_QUERY,
                json!({ "login": login, "after": after }),
            )
            .await?;
        let connection = data.user.ok_or(FetchError::NotFound)?.pull_requests;
        total = connection.total_count;
        items.extend(
            connection
                .nodes
                .into_iter()
                .flatten()
                .filter_map(|node| pull_request_fact(node, login)),
        );
        if !connection.page_info.has_next_page {
            break;
        }
        after = connection.page_info.end_cursor;
    }
    Ok((items, total))
}

fn pull_request_fact(node: PullRequestNode, login: &str) -> Option<PullRequestFact> {
    let repository = node.repository?;
    if repository.is_private {
        return None;
    }
    let is_other_human = |actor: &Option<Actor>| {
        actor.as_ref().is_some_and(|actor| {
            actor.typename == "User" && !actor.login.eq_ignore_ascii_case(login)
        })
    };
    Some(PullRequestFact {
        url: node.url.clone(),
        repository: repository.into_ref(),
        created_at: parse_time(&node.created_at)?,
        state: if node.merged {
            PullRequestState::Merged
        } else if node.state == "OPEN" {
            PullRequestState::Open
        } else {
            PullRequestState::Closed
        },
        additions: node.additions,
        deletions: node.deletions,
        merged_by_other: node.merged && is_other_human(&node.merged_by),
        merged_by_self: node.merged
            && node
                .merged_by
                .as_ref()
                .is_some_and(|actor| actor.login.eq_ignore_ascii_case(login)),
        reviewed_by_other: node
            .reviews
            .nodes
            .iter()
            .flatten()
            .any(|review| is_other_human(&review.author)),
    })
}

/// Pull requests into public repositories of other owners. A separate search keeps them visible
/// when automated pull requests to the account's own organizations dominate its recent history.
/// Owners where a round finds self-merged pull requests, or that fill half of a full page, are
/// excluded and the search repeats, up to three rounds, so one busy owner cannot hide the rest.
async fn fetch_external_pull_requests(
    client: &GitHubClient,
    login: &str,
    mut excluded: Vec<(String, bool)>,
) -> Result<(Vec<PullRequestFact>, u32), FetchError> {
    let mut found = Vec::new();
    let mut total = 0;
    for _ in 0..3 {
        let mut query = format!("is:pr is:public author:{login} -user:{login} sort:created-desc");
        for (owner, organization) in &excluded {
            let qualifier = format!(" -{}:{owner}", if *organization { "org" } else { "user" });
            // GitHub rejects search queries over 256 characters; the analysis filters the rest.
            if query.len() + qualifier.len() > 250 {
                break;
            }
            query.push_str(&qualifier);
        }
        let data: SearchData = client
            .graphql(EXTERNAL_PULL_REQUEST_QUERY, json!({ "query": query }))
            .await?;
        total = data.search.issue_count;
        let round = data
            .search
            .nodes
            .into_iter()
            .flatten()
            .filter_map(|node| pull_request_fact(node, login))
            .collect::<Vec<_>>();
        // Owners that dominate a full page hide everything else: search past them next round.
        let mut per_owner: BTreeMap<String, u32> = BTreeMap::new();
        for pull in &round {
            *per_owner
                .entry(pull.repository.owner_login.to_ascii_lowercase())
                .or_insert(0) += 1;
        }
        let mut affiliated = BTreeMap::new();
        for pull in round.iter().filter(|pull| {
            pull.merged_by_self
                || (round.len() >= 100
                    && per_owner
                        .get(&pull.repository.owner_login.to_ascii_lowercase())
                        .is_some_and(|count| *count >= 50))
        }) {
            affiliated.insert(
                pull.repository.owner_login.to_ascii_lowercase(),
                (
                    pull.repository.owner_login.clone(),
                    pull.repository.owner_is_organization,
                ),
            );
        }
        let new_owners = affiliated
            .into_values()
            .filter(|(owner, _)| {
                !excluded
                    .iter()
                    .any(|(known, _)| known.eq_ignore_ascii_case(owner))
            })
            .collect::<Vec<_>>();
        let complete = round.len() < 100 || new_owners.is_empty();
        found.extend(round);
        if complete {
            break;
        }
        excluded.extend(new_owners);
    }
    Ok((found, total))
}

/// Public memberships: GitHub's REST endpoint lists only public memberships whatever the token.
async fn fetch_organizations(
    client: &GitHubClient,
    login: &str,
) -> Result<Vec<OrganizationFact>, FetchError> {
    let listed: Vec<OrganizationLogin> = client
        .rest(&format!("/users/{login}/orgs?per_page=100"))
        .await?;
    if listed.is_empty() {
        return Ok(Vec::new());
    }
    let mut query = String::from("query {\n");
    for (index, organization) in listed.iter().enumerate() {
        query.push_str(&format!(
            "  o{index}: organization(login: {}) {{ login name membersWithRole {{ totalCount }} repositories(privacy: PUBLIC) {{ totalCount }} }}\n",
            json!(organization.login)
        ));
    }
    query.push('}');
    let data: BTreeMap<String, Option<OrganizationNode>> =
        client.graphql(&query, json!({})).await?;
    Ok((0..listed.len())
        .filter_map(|index| data.get(&format!("o{index}")).cloned().flatten())
        .map(|organization| OrganizationFact {
            login: organization.login,
            name: organization.name,
            members: organization.members_with_role.total_count,
            public_repositories: organization.repositories.total_count,
        })
        .collect())
}

fn commit_contributions(snapshot: &Snapshot) -> BTreeMap<String, u32> {
    let mut counts = BTreeMap::new();
    for year in &snapshot.years {
        for item in &year.commit_repositories {
            *counts
                .entry(item.repository.name_with_owner.clone())
                .or_insert(0) += item.count;
        }
    }
    counts
}

/// Public repositories with the most commit contributions, owned or not, then recently pushed owned
/// repositories without counted contributions.
fn primary_targets(snapshot: &Snapshot, limit: usize) -> Vec<String> {
    let mut ranked = commit_contributions(snapshot)
        .into_iter()
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let mut targets = ranked
        .into_iter()
        .map(|(name, _)| name)
        .take(limit)
        .collect::<Vec<_>>();
    for repository in &snapshot.owned {
        if targets.len() >= limit {
            break;
        }
        if !repository.fork && !targets.contains(&repository.name_with_owner) {
            targets.push(repository.name_with_owner.clone());
        }
    }
    targets
}

/// The smallest commit of each month, most recent months first.
fn timezone_targets(commits: &[CommitFact], limit: usize) -> Vec<CommitFact> {
    let mut by_month: BTreeMap<(i32, u32), &CommitFact> = BTreeMap::new();
    for commit in commits.iter().filter(|commit| !commit.is_merge()) {
        let key = (commit.authored_at.year(), commit.authored_at.month());
        by_month
            .entry(key)
            .and_modify(|current| {
                if commit.lines() < current.lines() {
                    *current = commit;
                }
            })
            .or_insert(commit);
    }
    by_month.into_values().rev().take(limit).cloned().collect()
}

fn aliased_repositories(targets: &[String], fragment: &str) -> String {
    let mut query = String::new();
    for (index, name) in targets.iter().enumerate() {
        let (owner, repository) = name.split_once('/').unwrap_or((name, ""));
        query.push_str(&format!(
            "  r{index}: repository(owner: {}, name: {}) {{ ...{fragment} }}\n",
            json!(owner),
            json!(repository)
        ));
    }
    query
}

async fn fetch_details(
    client: &GitHubClient,
    targets: Vec<String>,
) -> Result<Vec<PrimaryRepository>, FetchError> {
    let query = format!(
        "query {{\n{}}}\n{DETAIL_FRAGMENT}",
        aliased_repositories(&targets, "Detail")
    );
    let data: BTreeMap<String, Option<DetailNode>> = client.graphql(&query, json!({})).await?;
    Ok((0..targets.len())
        .filter_map(|index| data.get(&format!("r{index}")).cloned().flatten())
        .filter(|node| !node.is_private)
        .map(DetailNode::into_primary)
        .collect())
}

async fn fetch_histories(
    client: &GitHubClient,
    targets: Vec<String>,
    author_id: &str,
    since: DateTime<Utc>,
) -> Result<(Vec<CommitFact>, Vec<(String, HistoryShare)>), FetchError> {
    let query = format!(
        "query($author: ID!, $since: GitTimestamp!) {{\n{}}}\n{HISTORY_FRAGMENT}",
        aliased_repositories(&targets, "History")
    );
    let data: BTreeMap<String, Option<HistoryRepository>> = client
        .graphql(
            &query,
            json!({ "author": author_id, "since": since.to_rfc3339() }),
        )
        .await?;
    let mut commits = Vec::new();
    let mut shares = Vec::new();
    for (index, name) in targets.into_iter().enumerate() {
        let Some(Some(repository)) = data.get(&format!("r{index}")) else {
            continue;
        };
        if repository.is_private {
            continue;
        }
        let Some(target) = repository
            .default_branch_ref
            .as_ref()
            .and_then(|branch| branch.target.as_ref())
        else {
            continue;
        };
        if let (Some(history), Some(all)) = (&target.history, &target.all) {
            shares.push((
                name.clone(),
                HistoryShare {
                    authored: history.total_count,
                    total: all.total_count,
                },
            ));
        }
        let Some(history) = target.history.as_ref() else {
            continue;
        };
        commits.extend(history.nodes.iter().flatten().filter_map(|node| {
            Some(CommitFact {
                repository: name.clone(),
                oid: node.oid.clone(),
                authored_at: parse_time(&node.authored_date)?,
                committed_at: parse_time(&node.committed_date)?,
                additions: node.additions,
                deletions: node.deletions,
                headline: node.message_headline.clone(),
                parents: node.parents.total_count,
                signed: node
                    .signature
                    .as_ref()
                    .is_some_and(|signature| signature.is_valid),
            })
        }));
    }
    Ok((commits, shares))
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

fn public_contributions(items: Vec<ByRepository>) -> Vec<RepositoryContribution> {
    items
        .into_iter()
        .filter(|item| !item.repository.is_private)
        .map(|item| RepositoryContribution {
            count: item.contributions.total_count,
            repository: item.repository.into_ref(),
        })
        .collect()
}

const BIO_QUERY: &str = "query($login: String!) { user(login: $login) { bio } }";

const PROFILE_QUERY: &str = r"
query($login: String!) {
  user(login: $login) {
    id login createdAt bio
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
    contributionsCollection { contributionYears restrictedContributionsCount }
  }
}";

const REPOSITORY_REF: &str = "nameWithOwner isFork isPrivate stargazerCount owner { __typename login } primaryLanguage { name }";

static YEAR_COMMITS_QUERY: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
    format!(
        r"
query($login: String!, $from: DateTime!, $to: DateTime!) {{
  user(login: $login) {{
    contributionsCollection(from: $from, to: $to) {{
      totalCommitContributions restrictedContributionsCount
      commitContributionsByRepository(maxRepositories: 100) {{
        repository {{ {REPOSITORY_REF} }}
        contributions(first: 100) {{ totalCount nodes {{ occurredAt commitCount }} }}
      }}
    }}
  }}
}}"
    )
});

static YEAR_OTHER_QUERY: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
    let by_repository = format!(
        "(maxRepositories: 100) {{ repository {{ {REPOSITORY_REF} }} contributions(first: 100) {{ totalCount nodes {{ occurredAt }} }} }}"
    );
    format!(
        r"
query($login: String!, $from: DateTime!, $to: DateTime!) {{
  user(login: $login) {{
    contributionsCollection(from: $from, to: $to) {{
      totalPullRequestContributions totalPullRequestReviewContributions totalIssueContributions
      pullRequestContributionsByRepository{by_repository}
      pullRequestReviewContributionsByRepository{by_repository}
      issueContributionsByRepository{by_repository}
    }}
  }}
}}"
    )
});

const OWNED_QUERY: &str = r"
query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC,
                 orderBy: {field: PUSHED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner isFork isPrivate isArchived createdAt pushedAt stargazerCount forkCount diskUsage }
    }
  }
}";

const PULL_REQUEST_QUERY: &str = r"
query($login: String!, $after: String) {
  user(login: $login) {
    pullRequests(first: 100, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes {
        url createdAt state merged additions deletions
        mergedBy { __typename login }
        reviews(first: 10) { nodes { author { __typename login } } }
        repository { nameWithOwner isFork isPrivate stargazerCount owner { __typename login } primaryLanguage { name } }
      }
    }
  }
}";

const EXTERNAL_PULL_REQUEST_QUERY: &str = r"
query($query: String!) {
  search(type: ISSUE, query: $query, first: 100) {
    issueCount
    nodes {
      ... on PullRequest {
        url createdAt state merged additions deletions
        mergedBy { __typename login }
        reviews(first: 10) { nodes { author { __typename login } } }
        repository { nameWithOwner isFork isPrivate stargazerCount owner { __typename login } primaryLanguage { name } }
      }
    }
  }
}";

const DETAIL_FRAGMENT: &str = r#"
fragment Detail on Repository {
  nameWithOwner isFork isPrivate isArchived isTemplate createdAt pushedAt stargazerCount forkCount
  description licenseInfo { spdxId } primaryLanguage { name } owner { __typename login }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }
  root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
  github: object(expression: "HEAD:.github") { ... on Tree { entries { name } } }
  workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
  cargo: object(expression: "HEAD:Cargo.toml") { ... on Blob { byteSize text } }
  npm: object(expression: "HEAD:package.json") { ... on Blob { byteSize text } }
}"#;

const HISTORY_FRAGMENT: &str = r"
fragment History on Repository {
  isPrivate
  defaultBranchRef { target { ... on Commit {
    all: history(since: $since) { totalCount }
    history(first: 100, author: {id: $author}, since: $since) {
      totalCount
      nodes {
        oid authoredDate committedDate additions deletions messageHeadline
        parents { totalCount } signature { isValid }
      }
    }
  } } }
}";

#[derive(Deserialize, Clone)]
struct Count {
    #[serde(rename = "totalCount")]
    total_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Deserialize)]
struct BioData {
    user: Option<BioUser>,
}

#[derive(Deserialize)]
struct BioUser {
    bio: Option<String>,
}

#[derive(Deserialize)]
struct ProfileData {
    user: Option<ProfileUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileUser {
    id: String,
    login: String,
    created_at: String,
    bio: Option<String>,
    followers: Count,
    repositories: Count,
    contributions_collection: ProfileCollection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileCollection {
    contribution_years: Vec<i32>,
    restricted_contributions_count: u32,
}

#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<Option<T>>,
}

#[derive(Deserialize)]
struct OrganizationLogin {
    login: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OrganizationNode {
    login: String,
    name: Option<String>,
    members_with_role: Count,
    repositories: Count,
}

#[derive(Deserialize)]
struct YearCommitData {
    user: Option<YearCommitUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YearCommitUser {
    contributions_collection: YearCommitCollection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YearCommitCollection {
    total_commit_contributions: u32,
    restricted_contributions_count: u32,
    commit_contributions_by_repository: Vec<ByRepository>,
}

#[derive(Deserialize)]
struct YearOtherData {
    user: Option<YearOtherUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YearOtherUser {
    contributions_collection: YearOtherCollection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YearOtherCollection {
    total_pull_request_contributions: u32,
    total_pull_request_review_contributions: u32,
    total_issue_contributions: u32,
    pull_request_contributions_by_repository: Vec<ByRepository>,
    pull_request_review_contributions_by_repository: Vec<ByRepository>,
    issue_contributions_by_repository: Vec<ByRepository>,
}

#[derive(Deserialize)]
struct ByRepository {
    repository: RepositoryNode,
    contributions: DayConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DayConnection {
    total_count: u32,
    nodes: Vec<Option<DayNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DayNode {
    occurred_at: String,
    commit_count: Option<u32>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RepositoryNode {
    name_with_owner: String,
    is_fork: bool,
    is_private: bool,
    stargazer_count: u32,
    owner: OwnerNode,
    primary_language: Option<Named>,
}

impl RepositoryNode {
    fn into_ref(self) -> RepositoryRef {
        RepositoryRef {
            name_with_owner: self.name_with_owner,
            owner_is_organization: self.owner.typename == "Organization",
            owner_login: self.owner.login,
            fork: self.is_fork,
            stars: self.stargazer_count,
            primary_language: self.primary_language.map(|language| language.name),
        }
    }
}

#[derive(Deserialize, Clone)]
struct OwnerNode {
    #[serde(rename = "__typename")]
    typename: String,
    login: String,
}

#[derive(Deserialize, Clone)]
struct Named {
    name: String,
}

#[derive(Deserialize)]
struct OwnedData {
    user: Option<OwnedUser>,
}

#[derive(Deserialize)]
struct OwnedUser {
    repositories: OwnedConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnedConnection {
    page_info: PageInfo,
    nodes: Vec<Option<OwnedNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnedNode {
    name_with_owner: String,
    is_fork: bool,
    is_private: bool,
    is_archived: bool,
    created_at: String,
    pushed_at: Option<String>,
    stargazer_count: u32,
    fork_count: u32,
    disk_usage: Option<u32>,
}

#[derive(Deserialize)]
struct PullRequestData {
    user: Option<PullRequestUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestUser {
    pull_requests: PullRequestConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestConnection {
    total_count: u32,
    page_info: PageInfo,
    nodes: Vec<Option<PullRequestNode>>,
}

#[derive(Deserialize)]
struct SearchData {
    search: SearchConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchConnection {
    issue_count: u32,
    nodes: Vec<Option<PullRequestNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestNode {
    url: String,
    created_at: String,
    state: String,
    merged: bool,
    additions: u32,
    deletions: u32,
    merged_by: Option<Actor>,
    reviews: Nodes<ReviewNode>,
    repository: Option<RepositoryNode>,
}

#[derive(Deserialize)]
struct ReviewNode {
    author: Option<Actor>,
}

#[derive(Deserialize)]
struct Actor {
    #[serde(rename = "__typename")]
    typename: String,
    login: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DetailNode {
    name_with_owner: String,
    is_fork: bool,
    is_private: bool,
    is_archived: bool,
    is_template: bool,
    created_at: String,
    pushed_at: Option<String>,
    stargazer_count: u32,
    fork_count: u32,
    description: Option<String>,
    license_info: Option<License>,
    primary_language: Option<Named>,
    owner: OwnerNode,
    repository_topics: TopicNodes,
    languages: Option<LanguageConnection>,
    root: Option<TreeNode>,
    github: Option<TreeNode>,
    workflows: Option<TreeNode>,
    cargo: Option<BlobNode>,
    npm: Option<BlobNode>,
}

impl DetailNode {
    fn into_primary(self) -> PrimaryRepository {
        let names = |tree: Option<TreeNode>| -> Vec<(String, bool)> {
            tree.and_then(|tree| tree.entries)
                .map(|entries| {
                    entries
                        .into_iter()
                        .map(|entry| (entry.name, entry.kind.as_deref() == Some("tree")))
                        .collect()
                })
                .unwrap_or_default()
        };
        PrimaryRepository {
            reference: RepositoryRef {
                name_with_owner: self.name_with_owner,
                owner_is_organization: self.owner.typename == "Organization",
                owner_login: self.owner.login,
                fork: self.is_fork,
                stars: self.stargazer_count,
                primary_language: self.primary_language.map(|language| language.name),
            },
            contributions: 0,
            archived: self.is_archived,
            template: self.is_template,
            created_at: parse_time(&self.created_at),
            pushed_at: self.pushed_at.as_deref().and_then(parse_time),
            forks: self.fork_count,
            has_description: self
                .description
                .is_some_and(|description| !description.trim().is_empty()),
            license: self
                .license_info
                .and_then(|license| license.spdx_id)
                .filter(|id| id != "NOASSERTION"),
            topics: self
                .repository_topics
                .nodes
                .into_iter()
                .flatten()
                .map(|node| node.topic.name)
                .collect(),
            languages: self
                .languages
                .map(|languages| {
                    languages
                        .edges
                        .into_iter()
                        .map(|edge| (edge.node.name, edge.size))
                        .collect()
                })
                .unwrap_or_default(),
            root: names(self.root),
            github_dir: names(self.github)
                .into_iter()
                .map(|(name, _)| name)
                .collect(),
            workflows: u32::try_from(names(self.workflows).len()).unwrap_or(u32::MAX),
            cargo_manifest: self.cargo.and_then(BlobNode::small_text),
            npm_manifest: self.npm.and_then(BlobNode::small_text),
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct License {
    spdx_id: Option<String>,
}

#[derive(Deserialize, Clone)]
struct TopicNodes {
    nodes: Vec<Option<TopicNode>>,
}

#[derive(Deserialize, Clone)]
struct TopicNode {
    topic: Named,
}

#[derive(Deserialize, Clone)]
struct LanguageConnection {
    edges: Vec<LanguageEdge>,
}

#[derive(Deserialize, Clone)]
struct LanguageEdge {
    size: u64,
    node: Named,
}

#[derive(Deserialize, Clone)]
struct TreeNode {
    entries: Option<Vec<TreeEntry>>,
}

#[derive(Deserialize, Clone)]
struct TreeEntry {
    name: String,
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BlobNode {
    byte_size: Option<u64>,
    text: Option<String>,
}

impl BlobNode {
    /// Manifests over 256 KiB are generated or vendored; skip them.
    fn small_text(self) -> Option<String> {
        if self.byte_size.unwrap_or(0) <= 256 * 1024 {
            self.text
        } else {
            None
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryRepository {
    is_private: bool,
    default_branch_ref: Option<HistoryBranch>,
}

#[derive(Deserialize)]
struct HistoryBranch {
    target: Option<HistoryTarget>,
}

#[derive(Deserialize)]
struct HistoryTarget {
    all: Option<Count>,
    history: Option<AuthoredHistory>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthoredHistory {
    total_count: u32,
    nodes: Vec<Option<HistoryCommit>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryCommit {
    oid: String,
    authored_date: String,
    committed_date: String,
    additions: u32,
    deletions: u32,
    message_headline: String,
    parents: Count,
    signature: Option<Signature>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Signature {
    is_valid: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn commit(month: u32, lines: u32) -> CommitFact {
        CommitFact {
            repository: "a/b".into(),
            oid: format!("{month}-{lines}"),
            authored_at: Utc.with_ymd_and_hms(2026, month, 3, 12, 0, 0).unwrap(),
            committed_at: Utc.with_ymd_and_hms(2026, month, 3, 12, 0, 0).unwrap(),
            additions: lines,
            deletions: 0,
            headline: "change".into(),
            parents: 1,
            signed: false,
        }
    }

    #[test]
    fn timezone_samples_take_the_smallest_commit_of_recent_months() {
        let commits = vec![commit(1, 50), commit(1, 3), commit(2, 9), commit(3, 1)];
        let picked = timezone_targets(&commits, 2);
        assert_eq!(
            picked.iter().map(|c| c.oid.as_str()).collect::<Vec<_>>(),
            ["3-1", "2-9"]
        );
    }

    #[test]
    fn primary_targets_rank_contributions_then_owned_repositories() {
        let reference = |name: &str| RepositoryRef {
            name_with_owner: name.into(),
            ..RepositoryRef::default()
        };
        let snapshot = Snapshot {
            years: vec![YearFact {
                year: 2026,
                commit_repositories: vec![
                    RepositoryContribution {
                        repository: reference("org/small"),
                        count: 2,
                    },
                    RepositoryContribution {
                        repository: reference("org/main"),
                        count: 40,
                    },
                ],
                ..YearFact::default()
            }],
            owned: vec![
                OwnedRepository {
                    name_with_owner: "me/fork".into(),
                    fork: true,
                    ..OwnedRepository::default()
                },
                OwnedRepository {
                    name_with_owner: "me/tool".into(),
                    ..OwnedRepository::default()
                },
            ],
            ..Snapshot::default()
        };
        assert_eq!(
            primary_targets(&snapshot, 3),
            ["org/main", "org/small", "me/tool"]
        );
    }
}
