//! Bounded HTTP adapter for our fictional FSP provider, not the federation's API.
mod simulator;
pub use simulator::router;

use chrono::DateTime;
use fsp_application::{FspGateway, IntegrationError};
use fsp_domain::{FspParticipation, FspResult};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, time::Duration};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParticipantResults {
    pub version: String,
    pub synthetic: bool,
    pub participant_id: String,
    pub registered: bool,
    pub results: Vec<FspResult>,
}

pub struct HttpFsp {
    client: reqwest::Client,
    base: reqwest::Url,
}

impl HttpFsp {
    pub fn new(base: &str) -> Result<Self, IntegrationError> {
        let base = reqwest::Url::parse(base).map_err(|_| unavailable())?;
        if !matches!(base.scheme(), "http" | "https")
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || base.path() != "/"
        {
            return Err(unavailable());
        }
        Ok(Self {
            base,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(4))
                .connect_timeout(Duration::from_secs(2))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| unavailable())?,
        })
    }
}

fn unavailable() -> IntegrationError {
    IntegrationError {
        code: "fsp_unavailable",
        message: "Демонстрационный источник ФСП временно недоступен".into(),
    }
}
fn invalid() -> IntegrationError {
    IntegrationError {
        code: "fsp_invalid_response",
        message: "Демонстрационный источник ФСП вернул некорректные данные".into(),
    }
}
fn valid_account(account: &str) -> bool {
    !account.is_empty()
        && account.len() <= 100
        && account
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
}

fn validate_result(result: &FspResult) -> bool {
    let timestamp = |s: &str| DateTime::parse_from_rfc3339(s).ok();
    let ordered = timestamp(&result.starts_at)
        .zip(timestamp(&result.ends_at))
        .is_some_and(|(start, end)| start <= end);
    let publication_valid = result
        .published_at
        .as_deref()
        .and_then(timestamp)
        .zip(timestamp(&result.ends_at))
        .is_some_and(|(p, end)| p >= end);
    let small = |s: &str| {
        !s.trim().is_empty() && s.chars().count() <= 200 && !s.chars().any(char::is_control)
    };
    result.synthetic
        && valid_account(&result.competition_id)
        && small(&result.competition_name)
        && small(&result.discipline)
        && ordered
        && (1..=100_000).contains(&result.field_size)
        && match result.scope.as_str() {
            "individual" => result.team_name.is_none() && result.team_size.is_none(),
            "team" => {
                result.team_name.as_deref().is_some_and(small)
                    && result.team_size.is_some_and(|n| (3..=6).contains(&n))
            }
            _ => false,
        }
        && match result.status.as_str() {
            "published" => {
                result
                    .place
                    .is_some_and(|p| p > 0 && p <= result.field_size)
                    && result.score.is_some()
                    && publication_valid
                    && result.protocol_reference.as_deref().is_some_and(small)
            }
            "pending" => {
                result.place.is_none()
                    && result.score.is_none()
                    && result.published_at.is_none()
                    && result.protocol_reference.is_none()
            }
            "disqualified" => {
                result.place.is_none()
                    && result.score.is_none()
                    && publication_valid
                    && result.protocol_reference.as_deref().is_some_and(small)
            }
            _ => false,
        }
}

#[async_trait::async_trait]
impl FspGateway for HttpFsp {
    async fn participation(&self, account: &str) -> Result<FspParticipation, IntegrationError> {
        let normalized = account.trim().to_ascii_uppercase();
        let account = normalized.as_str();
        if !valid_account(account) {
            return Err(IntegrationError {
                code: "fsp_account_invalid",
                message: "Используйте буквы, цифры, дефис или подчёркивание в ФСП ID".into(),
            });
        }
        let url = self
            .base
            .join(&format!("v1/participants/{account}/results"))
            .map_err(|_| unavailable())?;
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| unavailable())?;
        if !response.status().is_success() {
            return Err(unavailable());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
            if bytes.len() + chunk.len() > 65_536 {
                return Err(invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        let payload: ParticipantResults = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
        let mut ids = HashSet::new();
        if payload.version != "fsp-demo-v1"
            || !payload.synthetic
            || payload.participant_id != account
            || payload.results.len() > 50
            || (!payload.registered && !payload.results.is_empty())
            || !payload
                .results
                .iter()
                .all(|r| validate_result(r) && ids.insert(r.competition_id.clone()))
        {
            return Err(invalid());
        }
        let competition_ids: Vec<String> = payload
            .results
            .iter()
            .filter(|r| r.status == "published")
            .map(|r| r.competition_id.clone())
            .collect();
        Ok(FspParticipation {
            account_label: payload.participant_id,
            verified: !competition_ids.is_empty(),
            competition_ids,
            results: payload.results,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn serve(app: axum::Router) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        (
            url,
            tokio::spawn(async move { axum::serve(listener, app).await.unwrap() }),
        )
    }
    #[tokio::test]
    async fn http_results_preserve_team_scope_and_exclude_pending_or_disqualified_results() {
        let (url, server) = serve(router()).await;
        let gateway = HttpFsp::new(&url).unwrap();
        let result = gateway.participation(" FSP-DEMO-024 ").await.unwrap();
        assert!(result.verified);
        assert_eq!(result.competition_ids, ["competition-demo-api"]);
        assert_eq!(result.results[0].scope, "team");
        assert_eq!(result.results[0].team_size, Some(4));
        for account in [
            "FSP-DEMO-PENDING",
            "FSP-DEMO-EMPTY",
            "unknown",
            "FSP-DEMO-DQ",
        ] {
            let result = gateway.participation(account).await.unwrap();
            assert!(!result.verified);
            assert!(result.competition_ids.is_empty());
        }
        assert!(gateway.participation("../wrong").await.is_err());
        server.abort();
        let _ = server.await;
        assert_eq!(
            gateway
                .participation("FSP-DEMO-024")
                .await
                .unwrap_err()
                .code,
            "fsp_unavailable"
        );
    }
    #[tokio::test]
    async fn malformed_wrong_subject_and_oversized_responses_fail_closed() {
        for payload in [
            "{}".into(),
            "x".repeat(65_537),
            serde_json::to_string(&simulator::fixture("FSP-DEMO-031")).unwrap(),
        ] {
            let app = axum::Router::new().fallback(axum::routing::get(move || {
                let value = payload.clone();
                async move { value }
            }));
            let (url, server) = serve(app).await;
            assert_eq!(
                HttpFsp::new(&url)
                    .unwrap()
                    .participation("FSP-DEMO-024")
                    .await
                    .unwrap_err()
                    .code,
                "fsp_invalid_response"
            );
            server.abort();
        }
    }
}
