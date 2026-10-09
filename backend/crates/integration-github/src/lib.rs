//! GitHub adapters: OAuth identity (an optional ownership proof) and the client of the loopback
//! insights service, which performs all public-activity analysis.

use std::time::Duration;

use async_trait::async_trait;
use fsp_application::{GitHubGateway, GitHubInsights, GitHubInsightsGateway, IntegrationError};
use fsp_domain::GitHubReport;
use reqwest::{Client, StatusCode, Url};
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

    async fn authenticated_login(&self, token: &str) -> Result<String, IntegrationError> {
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
        Ok(user.login)
    }
}

/// Client of the `fsp-github-insights` loopback service.
pub struct HttpInsights {
    client: Client,
    base: String,
}

impl HttpInsights {
    pub fn new(base: &str) -> Result<Self, IntegrationError> {
        let base = Url::parse(base).map_err(integration)?;
        if !matches!(base.scheme(), "http" | "https") {
            return Err(unavailable());
        }
        Ok(Self {
            // The service bounds its own collection to 38 seconds; this stays inside the API's
            // 45-second integration budget.
            client: Client::builder()
                .timeout(Duration::from_secs(44))
                .connect_timeout(Duration::from_secs(2))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(integration)?,
            base: base.as_str().trim_end_matches('/').to_owned(),
        })
    }
}

#[async_trait]
impl GitHubInsightsGateway for HttpInsights {
    async fn report(
        &self,
        login: &str,
        ownership_code: Option<&str>,
        refresh: bool,
    ) -> Result<GitHubInsights, IntegrationError> {
        let response = self
            .client
            .post(format!("{}/v1/reports", self.base))
            .json(&ReportRequest {
                login,
                ownership_code,
                refresh,
            })
            .send()
            .await
            .map_err(integration)?;
        let status = response.status();
        if !status.is_success() {
            return Err(match status {
                StatusCode::BAD_REQUEST => IntegrationError {
                    code: "github_login_invalid",
                    message: "Укажите имя пользователя GitHub или ссылку на профиль".into(),
                },
                StatusCode::NOT_FOUND => IntegrationError {
                    code: "github_account_not_found",
                    message: "Пользователь GitHub не найден".into(),
                },
                StatusCode::TOO_MANY_REQUESTS => IntegrationError {
                    code: "github_rate_limited",
                    message: "GitHub временно ограничил запросы, повторите позже".into(),
                },
                _ => unavailable(),
            });
        }
        let body = response
            .json::<ReportResponse>()
            .await
            .map_err(integration)?;
        Ok(GitHubInsights {
            report: body.report,
            ownership_code_found: body.ownership_code_found,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportRequest<'a> {
    login: &'a str,
    ownership_code: Option<&'a str>,
    refresh: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportResponse {
    report: GitHubReport,
    ownership_code_found: Option<bool>,
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

fn unavailable() -> IntegrationError {
    IntegrationError {
        code: "github_unavailable",
        message: "GitHub временно недоступен".into(),
    }
}

fn integration(_error: impl std::fmt::Display) -> IntegrationError {
    unavailable()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn oauth_identity_is_read_from_the_token() {
        use axum::{Router, routing::get};
        let app = Router::new().route(
            "/user",
            get(|| async { axum::Json(serde_json::json!({ "login": "Owner" })) }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let mut api = GitHubApi::new("test".into(), "test".into()).unwrap();
        api.api_base = format!("http://{address}");
        assert_eq!(
            api.authenticated_login("fixture-token").await.unwrap(),
            "Owner"
        );
        server.abort();
    }

    #[tokio::test]
    async fn insights_errors_keep_their_meaning_without_upstream_details() {
        use axum::{Router, http::StatusCode, routing::post};
        let app = Router::new().route(
            "/v1/reports",
            post(
                |axum::Json(body): axum::Json<serde_json::Value>| async move {
                    match body["login"].as_str() {
                        Some("missing") => (StatusCode::NOT_FOUND, "{}"),
                        Some("limited") => (StatusCode::TOO_MANY_REQUESTS, "{}"),
                        _ => (StatusCode::SERVICE_UNAVAILABLE, "secret upstream detail"),
                    }
                },
            ),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let insights = HttpInsights::new(&format!("http://{address}")).unwrap();
        for (login, code) in [
            ("missing", "github_account_not_found"),
            ("limited", "github_rate_limited"),
            ("other", "github_unavailable"),
        ] {
            let error = insights.report(login, None, false).await.unwrap_err();
            assert_eq!(error.code, code);
            assert!(!error.message.contains("secret"));
        }
        server.abort();
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
}
