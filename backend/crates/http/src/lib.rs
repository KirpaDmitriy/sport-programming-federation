//! Inbound HTTP adapter for the application use cases.

mod error;
mod extract;

use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::header::{CACHE_CONTROL, COOKIE, ORIGIN, SET_COOKIE, X_CONTENT_TYPE_OPTIONS};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{any, delete, get, patch, post};
use axum::{Json, Router};
use chrono::Utc;
use fsp_application::{
    ApplicationError, CandidateSearch, CompanyPatch, EmailChallengeInput, EmailVerifyInput,
    PlatformService, ProfilePatch, SessionView,
};
use fsp_domain::{Grade, Specialization};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

pub use error::{ApiError, Detail};
pub use extract::IdempotencyKey;
use extract::{ContractJson, ContractPath, ContractQuery, reject_duplicate_query};

const REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");
const IDEMPOTENT_REPLAY: HeaderName = HeaderName::from_static("x-idempotent-replay");
const SESSION_COOKIE: &str = "fsp_session";
/// JSON body ceiling, shared with the mock's `MAX_JSON`.
const MAX_JSON_BODY: usize = 512 * 1024;

#[derive(Debug, Clone)]
pub struct HttpConfig {
    pub allowed_origins: Vec<String>,
    pub secure_cookie: bool,
    pub public_web_url: String,
    pub github_callback_url: String,
    pub static_dir: Option<PathBuf>,
}

#[derive(Clone)]
struct AppState {
    service: Arc<PlatformService>,
    config: Arc<HttpConfig>,
}

pub fn router(config: HttpConfig, service: Arc<PlatformService>) -> Router {
    let state = AppState {
        service,
        config: Arc::new(config),
    };
    let static_dir = state.config.static_dir.clone();
    // Routes without a request body reject one with `400 body_not_allowed`, and
    // every routed request rejects repeated query keys with
    // `duplicate_query_parameter`; both guards sit on routes so unmatched paths
    // still answer `404 not_found` exactly like the mock.
    let bodyless = Router::new()
        .route("/health", get(health))
        .route("/api/v1/meta", get(meta))
        .route("/api/v1/auth/session", delete(logout))
        .route("/api/v1/session", get(session))
        .route("/api/v1/me/profile", get(get_profile))
        .route("/api/v1/company", get(get_company))
        .route("/api/v1/needs", get(get_needs))
        .route("/api/v1/needs/{need_id}", get(get_need))
        .route("/api/v1/needs/{need_id}", delete(delete_need))
        .route("/api/v1/needs/{need_id}/publish", post(publish_need))
        .route("/api/v1/needs/{need_id}/unpublish", post(unpublish_need))
        .route("/api/v1/needs/{need_id}/graph", get(need_graph))
        .route("/api/v1/vacancies", get(search_vacancies))
        .route("/api/v1/vacancies/{vacancy_id}", get(get_vacancy))
        .route("/api/v1/candidates", get(search_candidates))
        .route("/api/v1/candidates/{candidate_id}", get(get_candidate))
        .route(
            "/api/v1/integrations/github/authorize",
            get(authorize_github),
        )
        .route("/api/v1/integrations/github/callback", get(github_callback))
        .route("/api/v1/me/sources", get(get_sources))
        .route("/api/v1/me/skills", get(get_skills))
        .route("/api/v1/me/graph", get(get_my_graph))
        .route(
            "/api/v1/candidates/{candidate_id}/graph",
            get(get_candidate_graph),
        )
        .route("/api/v1/me/sources/{source_id}/sync", post(sync_source))
        .route("/api/v1/jobs/{job_id}", get(get_job))
        .route("/api/v1/shortlists", get(get_shortlists))
        .route("/api/v1/applications", get(get_company_applications))
        .route("/api/v1/me/invitations", get(get_my_invitations))
        .route_layer(middleware::from_fn(no_body));
    let bodied = Router::new()
        .route(
            "/api/v1/auth/email/challenges",
            post(create_email_challenge),
        )
        .route("/api/v1/auth/email/verify", post(verify_email))
        .route("/api/v1/me/profile", patch(update_profile))
        .route("/api/v1/company", patch(update_company))
        .route("/api/v1/needs", post(create_need))
        .route("/api/v1/needs/{need_id}", patch(update_need))
        .route(
            "/api/v1/me/sources/{provider}/connect",
            post(connect_source),
        );
    let router: Router = bodyless
        .merge(bodied)
        .route_layer(middleware::from_fn(query_guard))
        .route("/api/{*path}", any(not_found))
        .route("/__mock__", any(not_found))
        .route("/__mock__/{*path}", any(not_found))
        .method_not_allowed_fallback(not_found)
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(MAX_JSON_BODY))
        .with_state(state.clone());
    // The static fallback and the transport envelope wrap every path, so apply
    // them last, to the whole router.
    let router = if let Some(static_dir) = static_dir {
        router.fallback_service(
            ServeDir::new(&static_dir).fallback(ServeFile::new(static_dir.join("index.html"))),
        )
    } else {
        router
    };
    router.layer(middleware::from_fn_with_state(state, transport))
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "fsp-career-api",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Emits an idempotent command's outcome: stored bodies replay verbatim with
/// `X-Idempotent-Replay: true`, fresh results serialize normally.
pub fn idempotent_response<T: Serialize>(
    status: StatusCode,
    outcome: fsp_application::Idempotent<T>,
) -> Response {
    match outcome {
        fsp_application::Idempotent::Replayed { status, body } => {
            let mut response = Response::new(Body::from(body));
            *response.status_mut() = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
            response.headers_mut().insert(
                axum::http::header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            );
            response
                .headers_mut()
                .insert(IDEMPOTENT_REPLAY, HeaderValue::from_static("true"));
            response
        }
        fsp_application::Idempotent::Fresh(value) => (status, Json(value)).into_response(),
    }
}

async fn meta(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "contractVersion": "0.1.0",
        "mode": "live",
        "serverTime": Utc::now().to_rfc3339(),
        "scenario": "live",
        "capabilities": {
            "emailVerification": true, "profilePdf": false, "githubFixture": false,
            "fspFixture": true, "matching": true, "directInvitations": false,
            "vacancyPublication": false, "selfApplication": false, "chat": false,
            "recurringTasks": false, "realCodeExecution": false, "realLlm": state.service.llm_configured(),
            "githubOAuth": state.service.github_configured()
        },
        "assessmentPolicy": {
            "successfulGradeChangeCooldownDays": 90, "failedAttemptCooldownDays": 0,
            "serviceFailureCooldownDays": 0, "sameGradeRetryCooldownDays": 0,
            "aiAllowed": true, "externalAiAllowed": true,
            "supportedScopes": [
                {"specialization":"backend","grades":["junior","middle","senior"]}
            ]
        },
        "competitions": [
            {"id":"competition-demo-api","name":"Демо: проектирование надёжного API","synthetic":true,"skillIds":["rust","postgresql"],"discipline":"Продуктовое программирование"},
            {"id":"competition-demo-systems","name":"Демо: распределённые системы","synthetic":true,"skillIds":["docker","redis"],"discipline":"Продуктовое программирование"}
        ],
        "skills": [
            {"id":"rust","label":"Rust"},{"id":"postgresql","label":"PostgreSQL"},
            {"id":"docker","label":"Docker"},{"id":"redis","label":"Redis"},{"id":"react","label":"React"}
        ]
    }))
}

async fn create_email_challenge(
    State(state): State<AppState>,
    ContractJson(input): ContractJson<EmailChallengeInput>,
) -> Result<(StatusCode, Json<fsp_application::EmailChallengeView>), ApiError> {
    state
        .service
        .request_challenge(input)
        .map(|view| (StatusCode::CREATED, Json(view)))
        .map_err(api_error)
}

async fn verify_email(
    State(state): State<AppState>,
    ContractJson(input): ContractJson<EmailVerifyInput>,
) -> Result<Response, ApiError> {
    let (session, token) = state.service.verify_email(input).map_err(api_error)?;
    let mut response = Json(session).into_response();
    let secure = if state.config.secure_cookie {
        "; Secure"
    } else {
        ""
    };
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000{secure}"
        ))
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Сервис временно недоступен",
            )
        })?,
    );
    Ok(response)
}

async fn session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionView>, ApiError> {
    let token = session_token(&headers)?;
    state.service.session(token).map(Json).map_err(api_error)
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    if let Ok(token) = session_token(&headers) {
        state.service.logout(token).map_err(api_error)?;
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        HeaderValue::from_static("fsp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"),
    );
    Ok(response)
}

async fn get_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::ProfileView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state.service.profile(&session).map(Json).map_err(api_error)
}

async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractJson(patch): ContractJson<ProfilePatch>,
) -> Result<Json<fsp_application::ProfileView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .update_profile(&session, patch)
        .map(Json)
        .map_err(api_error)
}

async fn get_company(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::CompanyView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state.service.company(&session).map(Json).map_err(api_error)
}

async fn update_company(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractJson(patch): ContractJson<CompanyPatch>,
) -> Result<Json<fsp_application::CompanyView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .update_company(&session, patch)
        .map(Json)
        .map_err(api_error)
}

async fn get_needs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::NeedsView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state.service.needs(&session).map(Json).map_err(api_error)
}

async fn create_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractJson(input): ContractJson<fsp_application::NeedInput>,
) -> Result<(StatusCode, Json<fsp_application::NeedView>), ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .create_need(&session, input)
        .map(|need| (StatusCode::CREATED, Json(need)))
        .map_err(api_error)
}

async fn get_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
) -> Result<Json<fsp_application::NeedView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .get_need(&session, &need_id)
        .map(Json)
        .map_err(api_error)
}

async fn update_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
    ContractJson(patch): ContractJson<fsp_application::NeedPatch>,
) -> Result<Json<fsp_application::NeedView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .update_need(&session, &need_id, patch)
        .map(Json)
        .map_err(api_error)
}

async fn delete_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
) -> Result<StatusCode, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .delete_need(&session, &need_id)
        .map(|()| StatusCode::NO_CONTENT)
        .map_err(api_error)
}

async fn publish_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
) -> Result<Json<fsp_application::NeedView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .publish_need(&session, &need_id)
        .map(Json)
        .map_err(api_error)
}

async fn unpublish_need(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
) -> Result<Json<fsp_application::NeedView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .unpublish_need(&session, &need_id)
        .map(Json)
        .map_err(api_error)
}

async fn need_graph(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(need_id): ContractPath<String>,
) -> Result<Json<fsp_application::GraphView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .need_graph(&session, &need_id)
        .map(Json)
        .map_err(api_error)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VacancyQuery {
    specialization: Option<Specialization>,
    grade: Option<Grade>,
    work_mode: Option<String>,
    skill: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
}

async fn search_vacancies(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractQuery(query): ContractQuery<VacancyQuery>,
) -> Result<Json<fsp_application::VacancyPageView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(10);
    if page == 0 || page_size == 0 || page_size > 50 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "validation_error",
            "Проверьте параметры страницы",
        ));
    }
    if query
        .work_mode
        .as_deref()
        .is_some_and(|value| !["remote", "hybrid", "office"].contains(&value))
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "validation_error",
            "Запрос не соответствует контракту",
        ));
    }
    state
        .service
        .search_vacancies(
            &session,
            &fsp_application::VacancySearch {
                specialization: query.specialization,
                grade: query.grade,
                work_mode: query.work_mode,
                skill: query.skill,
                page,
                page_size,
            },
        )
        .map(Json)
        .map_err(api_error)
}

async fn get_vacancy(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(vacancy_id): ContractPath<String>,
) -> Result<Json<fsp_application::VacancyView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .get_vacancy(&session, &vacancy_id)
        .map(Json)
        .map_err(api_error)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CandidateQuery {
    need_id: Option<String>,
    mode: Option<String>,
    specialization: Option<Specialization>,
    grade: Option<Grade>,
    skill: Option<String>,
    fsp: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
}

async fn search_candidates(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractQuery(query): ContractQuery<CandidateQuery>,
) -> Result<Json<fsp_application::CandidatePageView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(10);
    if page == 0 || page_size == 0 || page_size > 50 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "validation_error",
            "Проверьте параметры страницы",
        ));
    }
    if query
        .mode
        .as_deref()
        .is_some_and(|value| value != "bank" && value != "recommended")
        || query
            .fsp
            .as_deref()
            .is_some_and(|value| value != "any" && value != "verified")
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "validation_error",
            "Проверьте параметры поиска",
        ));
    }
    state
        .service
        .candidate_search(
            &session,
            CandidateSearch {
                need_id: query.need_id,
                recommended: query.mode.as_deref() == Some("recommended"),
                specialization: query.specialization,
                grade: query.grade,
                skill: query.skill,
                fsp_verified: query.fsp.as_deref() == Some("verified"),
                page,
                page_size,
            },
        )
        .map(Json)
        .map_err(api_error)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CandidateDetailQuery {
    need_id: Option<String>,
}

async fn get_candidate(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(candidate_id): ContractPath<String>,
    ContractQuery(query): ContractQuery<CandidateDetailQuery>,
) -> Result<Json<fsp_application::AnonymousCandidateView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .candidate(&session, &candidate_id, query.need_id.as_deref())
        .map(Json)
        .map_err(api_error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizationUrlView {
    authorization_url: String,
}

async fn authorize_github(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuthorizationUrlView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .github_authorization_url(&session, &state.config.github_callback_url)
        .map(|authorization_url| Json(AuthorizationUrlView { authorization_url }))
        .map_err(api_error)
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    code: String,
    state: String,
}

async fn github_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractQuery(query): ContractQuery<OAuthCallbackQuery>,
) -> Result<Redirect, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .complete_github_authorization(&session, &query.state, &query.code)
        .await
        .map_err(api_error)?;
    Ok(Redirect::to(&format!(
        "{}/candidate/sources?github=authorized",
        state.config.public_web_url.trim_end_matches('/')
    )))
}

async fn get_sources(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::SourcesView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state.service.sources(&session).map(Json).map_err(api_error)
}

async fn get_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::SkillsView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state.service.skills(&session).map(Json).map_err(api_error)
}

async fn get_my_graph(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<fsp_application::GraphView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .my_graph(&session)
        .await
        .map(Json)
        .map_err(api_error)
}

async fn get_candidate_graph(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(candidate_id): ContractPath<String>,
) -> Result<Json<fsp_application::GraphView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .candidate_graph(&session, &candidate_id)
        .await
        .map(Json)
        .map_err(api_error)
}

async fn connect_source(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(provider): ContractPath<String>,
    ContractJson(input): ContractJson<fsp_application::SourceConnectInput>,
) -> Result<Json<fsp_application::SourceView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .connect_source(&session, &provider, input)
        .await
        .map(Json)
        .map_err(api_error)
}

async fn sync_source(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(source_id): ContractPath<String>,
) -> Result<(StatusCode, Json<fsp_application::JobView>), ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .sync_source(&session, &source_id)
        .await
        .map(|job| (StatusCode::ACCEPTED, Json(job)))
        .map_err(api_error)
}

async fn get_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    ContractPath(job_id): ContractPath<String>,
) -> Result<Json<fsp_application::JobView>, ApiError> {
    let session = authenticated(&state, &headers)?;
    state
        .service
        .job(&session, &job_id)
        .map(Json)
        .map_err(api_error)
}

async fn get_shortlists(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let session = authenticated(&state, &headers)?;
    require_role(&session, "employer")?;
    Ok(Json(json!({ "items": [] })))
}

async fn get_company_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let session = authenticated(&state, &headers)?;
    require_role(&session, "employer")?;
    Ok(Json(json!({ "items": [] })))
}

async fn get_my_invitations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let session = authenticated(&state, &headers)?;
    require_role(&session, "candidate")?;
    Ok(Json(json!({ "items": [] })))
}

fn require_role(session: &SessionView, role: &str) -> Result<(), ApiError> {
    let allowed = matches!(
        (session.role, role),
        (fsp_domain::Role::Candidate, "candidate") | (fsp_domain::Role::Employer, "employer")
    );
    if allowed {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "role_forbidden",
            "Действие недоступно для этой роли",
        ))
    }
}

async fn not_found() -> ApiError {
    ApiError::not_found("Маршрут не найден")
}

/// Rejects a body on a route that takes none (`400 body_not_allowed`), or
/// `413 body_too_large` past the JSON ceiling — the mock's order.
async fn no_body(request: Request, next: Next) -> Response {
    let (parts, body) = request.into_parts();
    match axum::body::to_bytes(body, MAX_JSON_BODY).await {
        Ok(bytes) if bytes.is_empty() => next.run(Request::from_parts(parts, Body::empty())).await,
        Ok(_) => ApiError::new(
            StatusCode::BAD_REQUEST,
            "body_not_allowed",
            "Этот маршрут не принимает тело запроса",
        )
        .into_response(),
        Err(_) => ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "body_too_large",
            "Файл или запрос превышает допустимый размер",
        )
        .into_response(),
    }
}

/// Rejects repeated query keys (`400 duplicate_query_parameter`) on every routed
/// request, like the mock does for all of them.
async fn query_guard(request: Request, next: Next) -> Response {
    match reject_duplicate_query(request.uri().query().unwrap_or_default()) {
        Ok(()) => next.run(request).await,
        Err(error) => error.into_response(),
    }
}

fn authenticated(state: &AppState, headers: &HeaderMap) -> Result<SessionView, ApiError> {
    state
        .service
        .session(session_token(headers)?)
        .map_err(api_error)
}

fn session_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies
                .split(';')
                .map(str::trim)
                .find_map(|cookie| cookie.strip_prefix("fsp_session="))
        })
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthenticated",
                "Войдите в аккаунт",
            )
        })
}

fn api_error(error: ApplicationError) -> ApiError {
    ApiError::new(
        StatusCode::from_u16(error.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        error.code,
        error.message,
    )
}

async fn transport(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let foreign = request.headers().get(ORIGIN).is_some_and(|origin| {
        !state
            .config
            .allowed_origins
            .iter()
            .any(|allowed| origin.as_bytes() == allowed.as_bytes())
    });
    let mut response = if foreign {
        ApiError::forbidden("origin_not_allowed", "Этот источник запроса не разрешён")
            .into_response()
    } else {
        next.run(request).await
    };
    if let Some(error) = response.extensions_mut().remove::<ApiError>() {
        response = error.render(&request_id);
    }
    let headers = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(&request_id) {
        headers.insert(REQUEST_ID, value);
    }
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use fsp_application::{
        ConsumeChallenge, PendingChallenge, PlatformRepository, RepositoryError,
        VerificationDelivery,
    };
    use fsp_domain::{
        Account, CandidateIndexRecord, CandidateProfile, Company, HiringNeedRecord, JobRecord,
        SourceRecord,
    };

    struct EmptyRepository;
    impl PlatformRepository for EmptyRepository {
        fn account_by_email(&self, _: &str) -> Result<Option<Account>, RepositoryError> {
            Ok(None)
        }
        fn account_by_id(&self, _: &str) -> Result<Option<Account>, RepositoryError> {
            Ok(None)
        }
        fn create_account(&self, _: &Account, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn create_candidate(&self, _: &CandidateProfile) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn create_company(&self, _: &Company) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn save_challenge(&self, _: &PendingChallenge) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn consume_challenge(
            &self,
            _: &str,
            _: &str,
            _: &str,
        ) -> Result<(ConsumeChallenge, Option<Account>), RepositoryError> {
            Ok((ConsumeChallenge::Missing, None))
        }
        fn create_session(&self, _: &str, _: &str, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn account_for_session(
            &self,
            _: &str,
            _: &str,
        ) -> Result<Option<Account>, RepositoryError> {
            Ok(None)
        }
        fn delete_session(&self, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn candidate(&self, _: &str) -> Result<Option<CandidateProfile>, RepositoryError> {
            Ok(None)
        }
        fn save_candidate(&self, _: &CandidateProfile) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn company(&self, _: &str) -> Result<Option<Company>, RepositoryError> {
            Ok(None)
        }
        fn save_company(&self, _: &Company) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn candidates(&self) -> Result<Vec<CandidateIndexRecord>, RepositoryError> {
            Ok(Vec::new())
        }
        fn needs(&self, _: &str) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
            Ok(Vec::new())
        }
        fn need(&self, _: &str, _: &str) -> Result<Option<HiringNeedRecord>, RepositoryError> {
            Ok(None)
        }
        fn save_need(&self, _: &HiringNeedRecord) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn delete_need(&self, _: &str, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn published_needs(&self) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
            Ok(Vec::new())
        }
        fn save_oauth_state(&self, _: &str, _: &str, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn consume_oauth_state(&self, _: &str, _: &str, _: &str) -> Result<bool, RepositoryError> {
            Ok(false)
        }
        fn save_github_token(&self, _: &str, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn github_token(&self, _: &str) -> Result<Option<String>, RepositoryError> {
            Ok(None)
        }
        fn sources(&self, _: &str) -> Result<Vec<SourceRecord>, RepositoryError> {
            Ok(Vec::new())
        }
        fn save_source(&self, _: &SourceRecord) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn save_job(&self, _: &JobRecord) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn job(&self, _: &str, _: &str) -> Result<Option<JobRecord>, RepositoryError> {
            Ok(None)
        }
        fn idempotency_get(
            &self,
            _: &str,
        ) -> Result<Option<fsp_application::StoredIdempotentResponse>, RepositoryError> {
            Ok(None)
        }
        fn idempotency_put(
            &self,
            _: &str,
            _: &str,
            _: u16,
            _: &str,
            _: &str,
        ) -> Result<(), RepositoryError> {
            Ok(())
        }
        fn seed_demo(&self, _: &str) -> Result<(), RepositoryError> {
            Ok(())
        }
    }
    struct Delivery;
    impl VerificationDelivery for Delivery {
        fn code_for(&self) -> String {
            "123456".into()
        }
        fn deliver(&self, _: &str, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn contract_name(&self) -> &'static str {
            "mock_mailbox"
        }
    }

    fn app_with_static(static_dir: Option<PathBuf>) -> Router {
        let service = Arc::new(PlatformService::new(
            Arc::new(EmptyRepository),
            Arc::new(Delivery),
        ));
        router(
            HttpConfig {
                allowed_origins: vec!["http://127.0.0.1:5173".into()],
                secure_cookie: false,
                public_web_url: "http://127.0.0.1:5173".into(),
                github_callback_url: "http://127.0.0.1:8080/api/v1/integrations/github/callback"
                    .into(),
                static_dir,
            },
            service,
        )
    }

    fn app() -> Router {
        app_with_static(None)
    }

    #[tokio::test]
    async fn health_and_origin_boundary_are_active() {
        use axum::body::Body;
        use axum::http::Method;
        use tower::ServiceExt;
        let response = app()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let response = app()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/health")
                    .header(ORIGIN, "https://evil.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn static_frontend_serves_deep_links_without_masking_api_404s() {
        use axum::body::Body;
        use http_body_util::BodyExt;
        use tower::ServiceExt;

        let static_dir = std::env::temp_dir().join(format!("fsp-http-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&static_dir).unwrap();
        std::fs::write(
            static_dir.join("index.html"),
            "<!doctype html><title>SPA</title>",
        )
        .unwrap();
        let app = app_with_static(Some(static_dir.clone()));

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/candidate/profile")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(body.starts_with(b"<!doctype html>"));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/unknown")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        std::fs::remove_dir_all(static_dir).unwrap();
    }

    #[tokio::test]
    async fn transport_rejections_use_the_contract_envelope() {
        use axum::body::Body;
        use axum::http::Method;
        use http_body_util::BodyExt;
        use tower::ServiceExt;

        async fn code_of(app: Router, request: Request<Body>) -> (StatusCode, Value) {
            let response = app.oneshot(request).await.unwrap();
            let status = response.status();
            assert!(response.headers().contains_key(REQUEST_ID));
            let body = response.into_body().collect().await.unwrap().to_bytes();
            let envelope: Value = serde_json::from_slice(&body).expect("envelope JSON");
            assert!(envelope["requestId"].is_string());
            (status, envelope)
        }
        let json = |body: &str| {
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/email/challenges")
                .header("content-type", "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap()
        };

        let (status, envelope) = code_of(app(), json("{")).await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::BAD_REQUEST, Some("invalid_json"))
        );

        let (status, envelope) = code_of(app(), json("{\"email\": 5}")).await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::BAD_REQUEST, Some("validation_error"))
        );
        assert!(
            envelope["details"]
                .as_array()
                .is_some_and(|d| !d.is_empty())
        );

        let (status, envelope) = code_of(
            app(),
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/email/challenges")
                .header("content-type", "text/plain")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::UNSUPPORTED_MEDIA_TYPE, Some("json_required"))
        );

        let (status, envelope) = code_of(
            app(),
            Request::builder()
                .uri("/api/v1/candidates?page=1&page=2")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::BAD_REQUEST, Some("duplicate_query_parameter"))
        );

        let (status, envelope) = code_of(
            app(),
            Request::builder()
                .uri("/health")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::BAD_REQUEST, Some("body_not_allowed"))
        );

        let (status, envelope) = code_of(
            app(),
            Request::builder()
                .uri("/api/v1/no-such-route?page=1&page=2")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::NOT_FOUND, Some("not_found"))
        );

        let (status, envelope) = code_of(app(), json(&" ".repeat(MAX_JSON_BODY + 1))).await;
        assert_eq!(
            (status, envelope["code"].as_str()),
            (StatusCode::PAYLOAD_TOO_LARGE, Some("body_too_large"))
        );
    }
}
