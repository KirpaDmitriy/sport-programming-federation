//! End-to-end service test against a fake GitHub: parsing of every query, the public-only rule and
//! the ownership code check.

use std::sync::Arc;

use axum::extract::Path;
use axum::routing::{get, post};
use axum::{Json, Router};
use fsp_github_insights::client::GitHubClient;
use fsp_github_insights::collect::Limits;
use fsp_github_insights::{InsightsState, router};
use serde_json::{Value, json};

fn repository(name: &str, private: bool, stars: u32) -> Value {
    let owner = name.split('/').next().unwrap();
    json!({
        "nameWithOwner": name, "isFork": false, "isPrivate": private, "stargazerCount": stars,
        "owner": { "__typename": if owner == "dev" { "User" } else { "Organization" }, "login": owner },
        "primaryLanguage": { "name": "Rust" }
    })
}

fn by_repository(name: &str, private: bool, days: &[(&str, u32)]) -> Value {
    json!({
        "repository": repository(name, private, 3),
        "contributions": {
            "totalCount": days.iter().map(|(_, count)| count).sum::<u32>(),
            "nodes": days.iter().map(|(date, count)| json!({
                "occurredAt": format!("{date}T07:00:00Z"), "commitCount": count
            })).collect::<Vec<_>>()
        }
    })
}

fn history(dates: &[&str]) -> Value {
    json!({
        "isPrivate": false,
        "defaultBranchRef": { "target": {
            "all": { "totalCount": dates.len() * 4 },
            "history": {
                "totalCount": dates.len(),
                "nodes": dates.iter().enumerate().map(|(index, date)| json!({
                    "oid": format!("{index:040x}"), "authoredDate": date, "committedDate": date,
                    "additions": 20, "deletions": 4, "messageHeadline": format!("feat: change number {index}"),
                    "parents": { "totalCount": 1 }, "signature": { "isValid": true }
                })).collect::<Vec<_>>()
            }
        } }
    })
}

async fn graphql(Json(body): Json<Value>) -> Json<Value> {
    let query = body["query"].as_str().unwrap_or_default();
    let data = if query.contains("contributionYears") {
        json!({ "user": {
            "id": "U_dev", "login": "dev", "createdAt": "2020-02-01T00:00:00Z",
            "bio": "Rust developer fsp-0123456789",
            "followers": { "totalCount": 12 }, "repositories": { "totalCount": 2 },
            "contributionsCollection": { "contributionYears": [2026], "restrictedContributionsCount": 40 }
        } })
    } else if query.contains("commitContributionsByRepository") {
        json!({ "user": { "contributionsCollection": {
            "totalCommitContributions": 1040, "restrictedContributionsCount": 40,
            "commitContributionsByRepository": [
                by_repository("dev/service", false, &[("2026-10-08", 3), ("2026-10-09", 2), ("2026-09-01", 35)]),
                by_repository("hidden/private-repo", true, &[("2026-10-07", 1000)]),
            ]
        } } })
    } else if query.contains("pullRequestContributionsByRepository") {
        json!({ "user": { "contributionsCollection": {
            "totalPullRequestContributions": 2, "totalPullRequestReviewContributions": 0,
            "totalIssueContributions": 0,
            "pullRequestContributionsByRepository": [
                by_repository("oss/library", false, &[("2026-08-03", 2)])
            ],
            "pullRequestReviewContributionsByRepository": [],
            "issueContributionsByRepository": []
        } } })
    } else if query.contains("ownerAffiliations: OWNER, privacy: PUBLIC,") {
        json!({ "user": { "repositories": {
            "pageInfo": { "hasNextPage": false, "endCursor": null },
            "nodes": [
                { "nameWithOwner": "dev/service", "isFork": false, "isPrivate": false, "isArchived": false,
                  "createdAt": "2025-01-01T00:00:00Z", "pushedAt": "2026-10-09T00:00:00Z",
                  "stargazerCount": 3, "forkCount": 1, "diskUsage": 900 },
                { "nameWithOwner": "dev/private-repo", "isFork": false, "isPrivate": true, "isArchived": false,
                  "createdAt": "2025-01-01T00:00:00Z", "pushedAt": "2026-10-09T00:00:00Z",
                  "stargazerCount": 0, "forkCount": 0, "diskUsage": 1 }
            ]
        } } })
    } else if query.contains("search(type: ISSUE") {
        json!({ "search": { "issueCount": 2, "nodes": [
            { "url": "https://github.com/oss/library/pull/7", "createdAt": "2026-08-03T10:00:00Z",
              "state": "MERGED", "merged": true, "additions": 30, "deletions": 5,
              "mergedBy": { "__typename": "User", "login": "maintainer" },
              "reviews": { "nodes": [ { "author": { "__typename": "User", "login": "maintainer" } } ] },
              "repository": repository("oss/library", false, 4200) },
            { "url": "https://github.com/hidden/private-repo/pull/1", "createdAt": "2026-08-03T10:00:00Z",
              "state": "MERGED", "merged": true, "additions": 1, "deletions": 1,
              "mergedBy": { "__typename": "User", "login": "maintainer" },
              "reviews": { "nodes": [] }, "repository": repository("hidden/private-repo", true, 0) }
        ] } })
    } else if query.contains("pullRequests(first: 100") {
        json!({ "user": { "pullRequests": {
            "totalCount": 0, "pageInfo": { "hasNextPage": false, "endCursor": null }, "nodes": []
        } } })
    } else if query.contains("organization(login") {
        json!({ "o0": { "login": "public-org", "name": "Public Org",
                        "membersWithRole": { "totalCount": 8 }, "repositories": { "totalCount": 5 } } })
    } else if query.contains("fragment Detail") {
        json!({ "r0": {
            "nameWithOwner": "dev/service", "isFork": false, "isPrivate": false, "isArchived": false,
            "isTemplate": false, "createdAt": "2025-01-01T00:00:00Z", "pushedAt": "2026-10-09T00:00:00Z",
            "stargazerCount": 3, "forkCount": 1, "description": "Order service",
            "licenseInfo": { "spdxId": "MIT" }, "primaryLanguage": { "name": "Rust" },
            "owner": { "__typename": "User", "login": "dev" },
            "repositoryTopics": { "nodes": [] },
            "languages": { "edges": [ { "size": 9000, "node": { "name": "Rust" } } ] },
            "root": { "entries": [
                { "name": "README.md", "type": "blob" }, { "name": "Cargo.lock", "type": "blob" },
                { "name": "tests", "type": "tree" }, { "name": "Dockerfile", "type": "blob" }
            ] },
            "github": { "entries": [ { "name": "dependabot.yml" } ] },
            "workflows": { "entries": [ { "name": "ci.yml" } ] },
            "cargo": { "byteSize": 120, "text": "[dependencies]\nsqlx = { version = \"0.8\", features = [\"postgres\"] }\n" },
            "npm": null
        } })
    } else if query.contains("fragment History") {
        json!({ "r0": history(&[
            "2026-10-09T04:00:00Z", "2026-10-09T04:30:00Z", "2026-10-08T05:00:00Z",
            "2026-10-07T05:10:00Z", "2026-10-06T05:00:00Z", "2026-10-05T06:00:00Z",
            "2026-10-02T05:00:00Z", "2026-10-01T05:00:00Z", "2026-09-30T05:00:00Z",
            "2026-09-29T05:00:00Z", "2026-09-28T05:00:00Z", "2026-09-25T05:00:00Z"
        ]) })
    } else {
        Value::Null
    };
    Json(json!({ "data": data }))
}

async fn organizations(Path(login): Path<String>) -> Json<Value> {
    assert_eq!(login, "dev");
    Json(json!([{ "login": "public-org" }]))
}

async fn patch(Path((_, _, _)): Path<(String, String, String)>) -> String {
    "From 0 Mon Sep 17 00:00:00 2001\nFrom: Dev <dev@example.invalid>\nDate: Fri, 9 Oct 2026 09:00:00 +0500\nSubject: [PATCH] change\n\n---\n".into()
}

#[tokio::test]
async fn reports_contain_only_public_facts_and_verify_ownership() {
    let fake = Router::new()
        .route("/graphql", post(graphql))
        .route("/users/{login}/orgs", get(organizations))
        .route("/repos/{owner}/{name}/commits/{oid}", get(patch));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let github = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, fake).await.unwrap() });

    let client =
        GitHubClient::with_endpoints("test".into(), format!("{github}/graphql"), github).unwrap();
    let service = router(Arc::new(InsightsState::new(
        Some(client),
        Limits::default(),
    )));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, service).await.unwrap() });

    let http = reqwest::Client::new();
    let response = http
        .post(format!("{base}/v1/reports"))
        .json(&json!({ "login": "https://github.com/dev", "ownershipCode": "fsp-0123456789" }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    let text = body.to_string();
    assert!(
        !text.contains("private-repo"),
        "private data leaked: {text}"
    );
    assert_eq!(body["ownershipCodeFound"], true);
    let report = &body["report"];
    assert_eq!(report["login"], "dev");
    assert_eq!(
        report["coverage"]["partial"], false,
        "{}",
        report["coverage"]
    );
    assert_eq!(report["coverage"]["commitContributions"], 40);
    assert_eq!(report["activity"]["privateContributionsLastYear"], 40);
    assert_eq!(
        report["organizations"]["memberships"][0]["login"],
        "public-org"
    );
    assert_eq!(report["collaboration"]["externalMerged"], 1);
    assert_eq!(report["rhythm"]["timezoneOffsets"][0]["offsetMinutes"], 300);
    assert_eq!(report["rhythm"]["hourlyPercent"][10], 75);
    let technologies = report["technologies"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["skillId"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(technologies, ["docker", "postgresql", "rust"]);
    let hygiene = &report["repositories"][0]["hygiene"];
    for signal in [
        "readme",
        "license",
        "ci",
        "tests",
        "lockfile",
        "dependency_updates",
        "container",
    ] {
        assert!(
            hygiene
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == signal),
            "{signal} missing in {hygiene}"
        );
    }

    let invalid = http
        .post(format!("{base}/v1/reports"))
        .json(&json!({ "login": "https://github.com/dev/service" }))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    let error: Value = invalid.json().await.unwrap();
    assert_eq!(error["code"], "github_login_invalid");
}

#[tokio::test]
async fn a_missing_token_is_reported_as_not_configured() {
    let service = router(Arc::new(InsightsState::new(None, Limits::default())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, service).await.unwrap() });
    let http = reqwest::Client::new();
    let health: Value = http
        .get(format!("{base}/health"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["github"], "missing_token");
    let response = http
        .post(format!("{base}/v1/reports"))
        .json(&json!({ "login": "dev" }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 503);
}
