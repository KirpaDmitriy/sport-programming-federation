use std::collections::BTreeSet;
use std::time::Duration;

use async_trait::async_trait;
use fsp_application::{GitHubGateway, IntegrationError};
use fsp_domain::{AnalyzedRepository, GitHubAnalysis, RepositoryMetrics};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};

pub struct GitHubApi {
    client: Client,
    api_base: String,
    client_id: String,
    client_secret: String,
}

impl GitHubApi {
    pub fn new(client_id: String, client_secret: String) -> Result<Self, IntegrationError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("vygotsky-fsp/0.1")
            .build()
            .map_err(integration)?;
        Ok(Self {
            client,
            api_base: "https://api.github.com".into(),
            client_id,
            client_secret,
        })
    }

    async fn analyze_identity(
        &self,
        username: &str,
        token: &str,
    ) -> Result<GitHubAnalysis, IntegrationError> {
        let user = self
            .client
            .get(format!("{}/user", self.api_base))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(integration)?
            .error_for_status()
            .map_err(integration)?
            .json::<ApiUser>()
            .await
            .map_err(integration)?;
        if !user.login.eq_ignore_ascii_case(username) {
            return Err(IntegrationError {
                code: "github_oauth_failed",
                message: "Авторизованный аккаунт GitHub не совпадает с указанным".into(),
            });
        }
        let username = user.login.as_str();
        let mut repositories = Vec::new();
        for page in 1..=3 {
            let batch = self
                .client
                .get(format!("{}/users/{username}/repos", self.api_base))
                .bearer_auth(token)
                .header("Accept", "application/vnd.github+json")
                .query(&[
                    ("per_page", "100"),
                    ("page", &page.to_string()),
                    ("sort", "pushed"),
                ])
                .send()
                .await
                .map_err(integration)?
                .error_for_status()
                .map_err(integration)?
                .json::<Vec<ApiRepository>>()
                .await
                .map_err(integration)?;
            let complete = batch.len() < 100;
            repositories.extend(
                batch
                    .into_iter()
                    .filter(|repository| !repository.fork)
                    .map(repository),
            );
            if complete {
                break;
            }
        }

        let mut active_dates = BTreeSet::new();
        for page in 1..=3 {
            let batch = self
                .client
                .get(format!("{}/users/{username}/events/public", self.api_base))
                .bearer_auth(token)
                .header("Accept", "application/vnd.github+json")
                .query(&[("per_page", "100"), ("page", &page.to_string())])
                .send()
                .await
                .map_err(integration)?
                .error_for_status()
                .map_err(integration)?
                .json::<Vec<ApiEvent>>()
                .await
                .map_err(integration)?;
            let complete = batch.len() < 100;
            active_dates.extend(
                batch
                    .into_iter()
                    .filter_map(|event| event.created_at.get(..10).map(str::to_owned)),
            );
            if complete {
                break;
            }
        }
        Ok(GitHubAnalysis {
            username: username.into(),
            repositories,
            active_days: active_dates.len() as u32,
            observed_from: active_dates.first().map(|date| format!("{date}T00:00:00Z")),
            observed_to: active_dates.last().map(|date| format!("{date}T23:59:59Z")),
        })
    }
}

#[async_trait]
impl GitHubGateway for GitHubApi {
    fn authorization_url(
        &self,
        state: &str,
        redirect_uri: &str,
    ) -> Result<String, IntegrationError> {
        let mut url =
            Url::parse("https://github.com/login/oauth/authorize").map_err(integration)?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("scope", "read:user")
            .append_pair("state", state);
        Ok(url.into())
    }

    async fn exchange_code(&self, code: &str) -> Result<String, IntegrationError> {
        let response = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .json(&TokenRequest {
                client_id: &self.client_id,
                client_secret: &self.client_secret,
                code,
            })
            .send()
            .await
            .map_err(integration)?
            .error_for_status()
            .map_err(integration)?
            .json::<TokenResponse>()
            .await
            .map_err(integration)?;
        response.access_token.ok_or_else(|| IntegrationError {
            code: "github_oauth_failed",
            message: "GitHub не выдал токен доступа".into(),
        })
    }

    async fn analyze(
        &self,
        username: &str,
        token: &str,
    ) -> Result<GitHubAnalysis, IntegrationError> {
        tokio::time::timeout(
            Duration::from_secs(45),
            self.analyze_identity(username, token),
        )
        .await
        .map_err(integration)?
    }
}

#[derive(Deserialize)]
struct ApiUser {
    login: String,
}

#[derive(Serialize)]
struct TokenRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    code: &'a str,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct ApiRepository {
    id: u64,
    name: String,
    html_url: String,
    language: Option<String>,
    topics: Vec<String>,
    stargazers_count: u64,
    forks_count: u64,
    open_issues_count: u64,
    size: u64,
    pushed_at: Option<String>,
    fork: bool,
}

#[derive(Deserialize)]
struct ApiEvent {
    created_at: String,
}

fn repository(value: ApiRepository) -> AnalyzedRepository {
    let mut technologies = BTreeSet::new();
    if value.language.as_deref() == Some("Rust") {
        technologies.insert("rust".into());
    }
    for topic in value.topics {
        let normalized = topic.to_lowercase();
        if [
            "rust",
            "postgresql",
            "docker",
            "redis",
            "typescript",
            "react",
        ]
        .contains(&normalized.as_str())
        {
            technologies.insert(normalized);
        }
    }
    AnalyzedRepository {
        id: format!("github-{}", value.id),
        name: value.name,
        url: value.html_url,
        technologies: technologies.into_iter().collect(),
        metrics: RepositoryMetrics {
            stars: value.stargazers_count,
            forks: value.forks_count,
            open_issues: value.open_issues_count,
            size_kib: value.size,
            pushed_at: value.pushed_at,
        },
    }
}

fn integration(_error: impl std::fmt::Display) -> IntegrationError {
    IntegrationError {
        code: "github_unavailable",
        message: "GitHub временно недоступен".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn analysis_is_bound_to_the_authenticated_identity() {
        use axum::{Router, routing::get};
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let reads = Arc::new(AtomicUsize::new(0));
        let counter = reads.clone();
        let app = Router::new()
            .route(
                "/user",
                get(|| async { axum::Json(ApiUserFixture { login: "Owner" }) }),
            )
            .fallback(get(move || {
                counter.fetch_add(1, Ordering::SeqCst);
                async { "[]" }
            }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let mut api = GitHubApi::new("test".into(), "test".into()).unwrap();
        api.api_base = format!("http://{address}");
        let error = api
            .analyze("someone-else", "fixture-token")
            .await
            .unwrap_err();
        assert_eq!(error.code, "github_oauth_failed");
        assert_eq!(reads.load(Ordering::SeqCst), 0);
        let analysis = api.analyze("owner", "fixture-token").await.unwrap();
        assert_eq!(analysis.username, "Owner");
        assert_eq!(reads.load(Ordering::SeqCst), 2);
        server.abort();
    }

    #[derive(Serialize)]
    struct ApiUserFixture {
        login: &'static str,
    }

    #[test]
    fn upstream_error_details_are_not_public() {
        let error = integration("https://user:private@example.invalid/?access_token=secret");
        assert_eq!(error.message, "GitHub временно недоступен");
    }

    #[test]
    fn authorization_url_keeps_state_and_callback_bound_to_the_request() {
        let gateway = GitHubApi::new("client-id".into(), "secret".into()).unwrap();
        let url = gateway
            .authorization_url(
                "state with spaces",
                "https://example.test/oauth/callback?source=github",
            )
            .unwrap();
        let parsed = Url::parse(&url).unwrap();
        let query = parsed
            .query_pairs()
            .collect::<std::collections::BTreeMap<_, _>>();

        assert_eq!(
            query.get("client_id").map(|value| value.as_ref()),
            Some("client-id")
        );
        assert_eq!(
            query.get("state").map(|value| value.as_ref()),
            Some("state with spaces")
        );
        assert_eq!(
            query.get("redirect_uri").map(|value| value.as_ref()),
            Some("https://example.test/oauth/callback?source=github")
        );
    }

    #[test]
    fn repository_metrics_are_reproducible_and_topics_are_allowlisted() {
        let value = repository(ApiRepository {
            id: 42,
            name: "evidence".into(),
            html_url: "https://github.com/example/evidence".into(),
            language: Some("Rust".into()),
            topics: vec!["PostgreSQL".into(), "unverified-topic".into()],
            stargazers_count: 7,
            forks_count: 3,
            open_issues_count: 2,
            size: 4096,
            pushed_at: Some("2026-10-06T12:00:00Z".into()),
            fork: false,
        });

        assert_eq!(value.technologies, vec!["postgresql", "rust"]);
        assert_eq!(value.metrics.stars, 7);
        assert_eq!(value.metrics.forks, 3);
        assert_eq!(value.metrics.open_issues, 2);
        assert_eq!(value.metrics.size_kib, 4096);
    }
}
