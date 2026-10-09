//! Loopback HTTP API of the insights service.
//!
//! `POST /v1/reports` analyzes one public account and `GET /health` reports readiness. Reports are
//! cached briefly per login, and concurrent requests for the same login share one analysis, so a
//! page refresh never multiplies GitHub traffic.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use fsp_domain::{GitHubReport, parse_github_login};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::Instant;

use crate::analysis::build_report;
use crate::client::{FetchError, GitHubClient};
use crate::collect::{CollectError, Limits, collect, ownership_code_found};

const CACHE_TTL: Duration = Duration::from_secs(10 * 60);

pub struct InsightsState {
    client: Option<GitHubClient>,
    limits: Limits,
    cache: Mutex<HashMap<String, (Instant, Arc<GitHubReport>)>>,
    inflight: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    analyses: Semaphore,
}

impl InsightsState {
    #[must_use]
    pub fn new(client: Option<GitHubClient>, limits: Limits) -> Self {
        Self {
            client,
            limits,
            cache: Mutex::new(HashMap::new()),
            inflight: Mutex::new(HashMap::new()),
            // Two full analyses at a time keep the token well inside GitHub's secondary limits.
            analyses: Semaphore::new(2),
        }
    }
}

pub fn router(state: Arc<InsightsState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/reports", post(report))
        .with_state(state)
}

async fn health(State(state): State<Arc<InsightsState>>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "github": if state.client.is_some() { "configured" } else { "missing_token" },
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReportRequest {
    login: String,
    ownership_code: Option<String>,
    #[serde(default)]
    refresh: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportResponse {
    report: GitHubReport,
    ownership_code_found: Option<bool>,
}

async fn report(
    State(state): State<Arc<InsightsState>>,
    Json(request): Json<ReportRequest>,
) -> Result<Json<ReportResponse>, ServiceError> {
    let login = parse_github_login(&request.login).ok_or(ServiceError::InvalidLogin)?;
    let code = request
        .ownership_code
        .filter(|code| (8..=64).contains(&code.len()));
    let client = state.client.as_ref().ok_or(ServiceError::NotConfigured)?;
    let key = login.to_ascii_lowercase();
    let lock = state
        .inflight
        .lock()
        .await
        .entry(key.clone())
        .or_default()
        .clone();
    let _guard = lock.lock().await;
    let cached = state
        .cache
        .lock()
        .await
        .get(&key)
        .filter(|(at, _)| at.elapsed() < CACHE_TTL)
        .map(|(_, report)| report.clone());
    let (report, ownership_code_found) = match cached.filter(|_| !request.refresh) {
        Some(report) => {
            let found = match code.as_deref() {
                Some(code) => Some(
                    ownership_code_found(client, &report.login, code)
                        .await
                        .map_err(ServiceError::from)?,
                ),
                None => None,
            };
            (report, found)
        }
        None => {
            let _permit = state
                .analyses
                .acquire()
                .await
                .map_err(|_| ServiceError::Unavailable)?;
            let started = Instant::now();
            let collected = collect(client, &login, code.as_deref(), &state.limits).await?;
            let report = Arc::new(build_report(&collected.snapshot));
            tracing::info!(
                elapsed_ms = started.elapsed().as_millis() as u64,
                partial = collected.snapshot.partial,
                commits = collected.snapshot.commits.len(),
                "github report built"
            );
            let mut cache = state.cache.lock().await;
            cache.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
            cache.insert(key.clone(), (Instant::now(), report.clone()));
            (report, collected.ownership_code_found)
        }
    };
    state.inflight.lock().await.remove(&key);
    Ok(Json(ReportResponse {
        report: report.as_ref().clone(),
        ownership_code_found,
    }))
}

#[derive(Debug)]
enum ServiceError {
    InvalidLogin,
    NotConfigured,
    UnknownAccount,
    RateLimited(u64),
    Unavailable,
}

impl From<CollectError> for ServiceError {
    fn from(error: CollectError) -> Self {
        match error {
            CollectError::UnknownAccount => Self::UnknownAccount,
            CollectError::Fetch(FetchError::RateLimited {
                retry_after_seconds,
            }) => Self::RateLimited(retry_after_seconds),
            CollectError::Fetch(FetchError::NotFound) => Self::UnknownAccount,
            CollectError::Fetch(_) => Self::Unavailable,
        }
    }
}

impl IntoResponse for ServiceError {
    fn into_response(self) -> Response {
        let (status, code, message, retry) = match self {
            Self::InvalidLogin => (
                StatusCode::BAD_REQUEST,
                "github_login_invalid",
                "Укажите имя пользователя GitHub или ссылку на профиль",
                None,
            ),
            Self::NotConfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "github_not_configured",
                "Анализ GitHub не настроен",
                None,
            ),
            Self::UnknownAccount => (
                StatusCode::NOT_FOUND,
                "github_account_not_found",
                "Пользователь GitHub не найден",
                None,
            ),
            Self::RateLimited(seconds) => (
                StatusCode::TOO_MANY_REQUESTS,
                "github_rate_limited",
                "GitHub временно ограничил запросы, повторите позже",
                Some(seconds),
            ),
            Self::Unavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "github_unavailable",
                "GitHub временно недоступен",
                None,
            ),
        };
        (
            status,
            Json(json!({ "code": code, "message": message, "retryAfterSeconds": retry })),
        )
            .into_response()
    }
}
