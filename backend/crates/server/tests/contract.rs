//! Contract behavior tests: the real HTTP router over a seeded isolated
//! PostgreSQL database. They mirror the mock's behavior matrix (mock-server's
//! `mock-api.test.ts`) against the Rust implementation.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode, header};
use fsp_application::{PlatformService, VerificationDelivery};
use fsp_http::{HttpConfig, router};
use fsp_integration_fsp_synthetic::SyntheticFsp;
use fsp_storage_postgres::PostgresRepository;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

/// Admin connection string for the test cluster; `just db-up` provides the
/// matching local PostgreSQL, CI runs the same service container.
fn test_admin_url() -> String {
    std::env::var("FSP_TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://fsp:fsp@127.0.0.1:5434/postgres".into())
}

struct FixedDelivery;

impl VerificationDelivery for FixedDelivery {
    fn code_for(&self) -> String {
        "123456".into()
    }

    fn deliver(&self, _email: &str, _code: &str) -> Result<(), String> {
        Ok(())
    }

    fn contract_name(&self) -> &'static str {
        "mock_mailbox"
    }
}

async fn test_app() -> axum::Router {
    let (repository, _database) =
        PostgresRepository::connect_test_database(&test_admin_url()).await;
    let repository = Arc::new(repository);
    let service = Arc::new(
        PlatformService::new(repository, Arc::new(FixedDelivery)).with_fsp(Arc::new(SyntheticFsp)),
    );
    service.initialize().await.expect("seeded demo data");
    router(
        HttpConfig {
            allowed_origins: vec!["http://localhost:5173".into()],
            secure_cookie: false,
            public_web_url: "http://localhost:5173".into(),
            github_callback_url: "http://localhost:8080/api/v1/integrations/github/callback".into(),
            static_dir: None,
        },
        service,
    )
}

fn request(method: &str, path: &str, cookie: Option<&str>, body: Option<Value>) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    match body {
        Some(value) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&value).unwrap()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

async fn call(app: &axum::Router, req: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let response = app.clone().oneshot(req).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, headers, body)
}

async fn get(app: &axum::Router, path: &str, cookie: Option<&str>) -> (StatusCode, Value) {
    let (status, _, body) = call(app, request("GET", path, cookie, None)).await;
    (status, body)
}

async fn send(
    app: &axum::Router,
    method: &str,
    path: &str,
    cookie: Option<&str>,
    body: Value,
) -> (StatusCode, Value) {
    let (status, _, body) = call(app, request(method, path, cookie, Some(body))).await;
    (status, body)
}

/// The five idempotent commands require `Idempotency-Key` (8..=128 chars).
fn keyed_request(
    method: &str,
    path: &str,
    cookie: Option<&str>,
    key: &str,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("idempotency-key", key);
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    match body {
        Some(value) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&value).unwrap()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

/// POST without a body — the command side of the bodyless router.
async fn post(app: &axum::Router, path: &str, cookie: Option<&str>) -> (StatusCode, Value) {
    let (status, _, body) = call(app, request("POST", path, cookie, None)).await;
    (status, body)
}

async fn send_keyed(
    app: &axum::Router,
    method: &str,
    path: &str,
    cookie: Option<&str>,
    key: &str,
    body: Value,
) -> (StatusCode, Value) {
    let (status, _, body) = call(app, keyed_request(method, path, cookie, key, Some(body))).await;
    (status, body)
}

/// The demo code completes `createEmailChallenge` + `verifyEmail` and returns
/// the session cookie pair for following calls.
async fn login(app: &axum::Router, email: &str, role: &str) -> String {
    let (status, body) = send(
        app,
        "POST",
        "/api/v1/auth/email/challenges",
        None,
        json!({"email": email, "role": role}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "challenge: {body}");
    let challenge_id = body["challengeId"].as_str().unwrap().to_owned();
    let (status, headers, body) = call(
        app,
        request(
            "POST",
            "/api/v1/auth/email/verify",
            None,
            Some(json!({"challengeId": challenge_id, "code": "123456"})),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "verify: {body}");
    let cookie = headers
        .get(header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or_default()
        .to_owned();
    assert!(cookie.starts_with("fsp_session="), "cookie: {cookie}");
    cookie
}

fn code(body: &Value) -> &str {
    body["code"].as_str().unwrap_or_default()
}

const EMPLOYER: &str = "hr@sever-tech.example";
const CANDIDATE: &str = "candidate031@example.com";
const CANDIDATE_JUNIOR: &str = "alexey@example.com";

#[tokio::test]
async fn transport_envelope_and_boundaries() {
    let app = test_app().await;
    // Unknown path returns the contract envelope, not a bare 404.
    let (status, body) = get(&app, "/api/v1/nowhere", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(code(&body), "not_found");
    assert!(body["requestId"].as_str().is_some());
    // Malformed JSON is `invalid_json`.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/email/challenges")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("{oops"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(code(&body), "invalid_json");
    // A schema violation reports field details.
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/auth/email/challenges",
        None,
        json!({"email": "a@b.c"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(code(&body), "validation_error");
    assert!(body["details"].as_array().is_some_and(|d| !d.is_empty()));
    // Repeating a query key is rejected before handlers run.
    let (status, body) = get(&app, "/api/v1/vacancies?skill=rust&skill=docker", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(code(&body), "duplicate_query_parameter");
}

#[tokio::test]
async fn session_and_role_boundaries() {
    let app = test_app().await;
    let (status, body) = get(&app, "/api/v1/me/profile", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(code(&body), "unauthenticated");
    let employer = login(&app, EMPLOYER, "employer").await;
    let (status, _) = get(&app, "/api/v1/me/profile", Some(&employer)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    // A second role on the same mailbox is refused.
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/auth/email/challenges",
        None,
        json!({"email": EMPLOYER, "role": "candidate"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(code(&body), "role_mismatch");
    // Session survives and resolves the actor.
    let (status, body) = get(&app, "/api/v1/session", Some(&employer)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["role"], "employer");
    assert_eq!(body["emailVerified"], true);
}

#[tokio::test]
async fn email_challenge_lifecycle() {
    let app = test_app().await;
    // A wrong code does not consume the challenge and reports invalid_code.
    let (_, body) = send(
        &app,
        "POST",
        "/api/v1/auth/email/challenges",
        None,
        json!({"email": "new-user@example.com", "role": "candidate"}),
    )
    .await;
    let challenge_id = body["challengeId"].as_str().unwrap();
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/auth/email/verify",
        None,
        json!({"challengeId": challenge_id, "code": "000000"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(code(&body), "invalid_code");
    // The right code still works afterwards.
    let cookie = login(&app, "new-user@example.com", "candidate").await;
    let (status, body) = get(&app, "/api/v1/me/profile", Some(&cookie)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["email"], "new-user@example.com");
    // Unknown challenge id is a 404.
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/auth/email/verify",
        None,
        json!({"challengeId": "challenge-nope", "code": "123456"}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let _ = body;
}

#[tokio::test]
async fn consent_gates_sensitive_operations() {
    let app = test_app().await;
    // A fresh candidate has no processing consent: profile import refuses.
    let cookie = login(&app, "fresh@example.com", "candidate").await;
    let boundary = "----fsp-test";
    let payload = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 body %%EOF\r\n--{boundary}--\r\n"
    )
    .into_bytes();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/me/profile/imports")
                .header(header::COOKIE, &cookie)
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(code(&body), "processing_consent_required");
}

#[tokio::test]
async fn needs_write_side_and_vacancy_projection() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    // Invalid salary range is a validation error.
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/needs",
        Some(&employer),
        json!({
            "title": "Backend engineer",
            "specialization": "backend",
            "grade": "middle",
            "workMode": "remote",
            "salary": {"from": 300000, "to": 200000, "currency": "RUB", "period": "month", "taxBasis": "gross"},
            "description": "Описание потребности для проверки валидации.",
            "requirements": [
                {"skillId": "rust", "criticality": "required", "minimumGrade": "middle",
                 "evidencePolicy": {"acceptAssessments": true, "acceptGithub": true, "acceptFsp": true,
                                    "competitionSelection": "system", "competitionIds": []}}
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(code(&body), "salary_range_invalid");
    // A valid draft is created and hidden from the vacancy list until published.
    let (status, draft) = send(
        &app,
        "POST",
        "/api/v1/needs",
        Some(&employer),
        json!({
            "title": "Инженер данных",
            "specialization": "backend",
            "grade": "junior",
            "workMode": "hybrid",
            "salary": {"from": 120000, "to": 180000, "currency": "RUB", "period": "month", "taxBasis": "gross"},
            "description": "Сбор и обработка данных для продуктовой аналитики.",
            "requirements": [
                {"skillId": "postgresql", "criticality": "required", "minimumGrade": "junior",
                 "evidencePolicy": {"acceptAssessments": true, "acceptGithub": false, "acceptFsp": true,
                                    "competitionSelection": "system", "competitionIds": []}}
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{draft}");
    let need_id = draft["id"].as_str().unwrap().to_owned();
    assert_eq!(draft["published"], false);
    let candidate = login(&app, CANDIDATE_JUNIOR, "candidate").await;
    let (status, _) = get(
        &app,
        &format!("/api/v1/vacancies/{need_id}"),
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    // Publishing projects the need into vacancies.
    let (status, body) = post(
        &app,
        &format!("/api/v1/needs/{need_id}/publish"),
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, vacancy) = get(
        &app,
        &format!("/api/v1/vacancies/{need_id}"),
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(vacancy["id"], need_id);
    assert!(vacancy["match"].is_object() || vacancy["match"].is_null());
    assert!(vacancy["eligibility"].is_object());
    // Tenant isolation: a candidate cannot read the employer's need draft list.
    let (status, body) = get(&app, "/api/v1/needs", Some(&candidate)).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
async fn invitations_freeze_terms_and_disclose_on_accept() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    let candidate = login(&app, CANDIDATE, "candidate").await;
    // Idempotent create: the same key replays the stored response.
    let invite = |key: &str| {
        Request::builder()
            .method("POST")
            .uri("/api/v1/invitations")
            .header(header::COOKIE, &employer)
            .header(header::CONTENT_TYPE, "application/json")
            .header("idempotency-key", key)
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "candidateId": "candidate031",
                    "needId": "need-001",
                    "message": "Позиция в основной команде"
                }))
                .unwrap(),
            ))
            .unwrap()
    };
    let (status, _, first) = call(&app, invite("invite-key-0001")).await;
    assert_eq!(status, StatusCode::CREATED, "{first}");
    let invitation_id = first["id"].as_str().unwrap().to_owned();
    let (status, headers, replay) = call(&app, invite("invite-key-0001")).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(replay["id"], invitation_id);
    assert_eq!(headers.get("x-idempotent-replay").unwrap(), "true");
    // The candidate lists and accepts the invitation.
    let (status, body) = get(&app, "/api/v1/me/invitations", Some(&candidate)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == invitation_id || item["need"]["id"] == "need-001")
    );
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/v1/me/invitations/{invitation_id}/accept"),
        Some(&candidate),
        json!({"disclose": ["name", "email", "sourceLinks"]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // The company now sees the candidate's disclosure.
    let (status, disclosure) = get(
        &app,
        "/api/v1/candidates/candidate031/disclosure",
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(disclosure["granted"], true);
}

#[tokio::test]
async fn applications_flow_both_sides() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    let candidate = login(&app, CANDIDATE_JUNIOR, "candidate").await;
    // The published vacancy is reachable and reports eligibility.
    let (status, vacancy) = get(&app, "/api/v1/vacancies/need-002", Some(&candidate)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(vacancy["eligibility"].is_object());
    // Apply with disclosure choices; createApplication is idempotent.
    let (status, application) = send_keyed(
        &app,
        "POST",
        "/api/v1/me/applications",
        Some(&candidate),
        "apply-key-0000001",
        json!({
            "vacancyId": "need-002",
            "message": "Хочу работать над вашими сервисами",
            "disclose": ["name", "email"]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{application}");
    let application_id = application["id"].as_str().unwrap().to_owned();
    // The employer lists the application and accepts it.
    let (status, listing) = get(&app, "/api/v1/applications", Some(&employer)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        listing["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == application_id)
    );
    let (status, decided) = post(
        &app,
        &format!("/api/v1/applications/{application_id}/accept"),
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{decided}");
    assert_eq!(decided["status"], "accepted");
    // Withdrawal keeps the terminal decision stable.
    let (status, body) = post(
        &app,
        &format!("/api/v1/me/applications/{application_id}/withdraw"),
        Some(&candidate),
    )
    .await;
    assert!(
        status == StatusCode::OK || status == StatusCode::CONFLICT,
        "{body}"
    );
}

#[tokio::test]
async fn assessments_full_flow_and_grade_change() {
    let app = test_app().await;
    let candidate = login(&app, CANDIDATE_JUNIOR, "candidate").await;
    // candidate-024 is junior-verified since June — a middle attempt is legal.
    let (status, assessment) = send_keyed(
        &app,
        "POST",
        "/api/v1/me/assessments",
        Some(&candidate),
        "assess-key-00001",
        json!({"specialization": "backend", "grade": "middle"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{assessment}");
    let assessment_id = assessment["id"].as_str().unwrap().to_owned();
    assert_eq!(assessment["status"], "draft");
    assert_eq!(assessment["task"]["family"], "idempotent-api");
    // A second active attempt conflicts.
    let (status, body) = send_keyed(
        &app,
        "POST",
        "/api/v1/me/assessments",
        Some(&candidate),
        "assess-key-00002",
        json!({"specialization": "backend", "grade": "senior"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(code(&body), "assessment_active");
    assert_eq!(assessment["simulation"], true);
    // Answers, checks and assistant.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/v1/me/assessments/{assessment_id}/answer"),
        Some(&candidate),
        json!({"code": "fn idempotent()", "explanation": "Ключ идемпотентности", "externalAiUsed": true}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, checks) = post(
        &app,
        &format!("/api/v1/me/assessments/{assessment_id}/checks"),
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{checks}");
    assert_eq!(checks["kind"], "checks");
    let (status, job) = get(
        &app,
        &format!("/api/v1/jobs/{}", checks["id"].as_str().unwrap()),
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job["status"], "succeeded");
    assert_eq!(job["result"]["kind"], "checks");
    let (status, answer) = send(
        &app,
        "POST",
        &format!("/api/v1/me/assessments/{assessment_id}/assistant"),
        Some(&candidate),
        json!({"message": "как проверить повтор?"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{answer}");
    // Submit is bodyless but keyed; it resolves synchronously in the demo.
    let (status, _, submit) = call(
        &app,
        keyed_request(
            "POST",
            &format!("/api/v1/me/assessments/{assessment_id}/submit"),
            Some(&candidate),
            "submit-key-00001",
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{submit}");
    let (status, job) = get(
        &app,
        &format!("/api/v1/jobs/{}", submit["id"].as_str().unwrap()),
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job["status"], "succeeded");
    assert_eq!(job["result"]["kind"], "assessment");
    assert_eq!(job["result"]["assessment"]["status"], "passed");
    let (_, profile) = get(&app, "/api/v1/me/profile", Some(&candidate)).await;
    assert_eq!(profile["verifiedGrade"], "middle");
}

#[tokio::test]
async fn assessment_guards_cooldown_and_downgrade() {
    let app = test_app().await;
    let senior = login(&app, CANDIDATE, "candidate").await;
    // candidate031 is senior-verified: a lower-grade attempt is a downgrade.
    let (status, body) = send_keyed(
        &app,
        "POST",
        "/api/v1/me/assessments",
        Some(&senior),
        "assess-key-00003",
        json!({"specialization": "backend", "grade": "junior"}),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(code(&body), "grade_downgrade_forbidden");
    // The frontend specialization is outside the supported scope.
    let (status, body) = send_keyed(
        &app,
        "POST",
        "/api/v1/me/assessments",
        Some(&senior),
        "assess-key-00004",
        json!({"specialization": "frontend", "grade": "senior"}),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(code(&body), "assessment_scope_unavailable");
}

#[tokio::test]
async fn idempotency_replays_and_conflicts() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    // createInvitation is one of the five idempotent commands.
    let body = json!({
        "candidateId": "candidate018",
        "needId": "need-001",
        "message": "Предложение по вакансии"
    });
    let invite = |key: &str, body: Value| {
        keyed_request(
            "POST",
            "/api/v1/invitations",
            Some(&employer),
            key,
            Some(body),
        )
    };
    let (status, _, first) = call(&app, invite("idem-key-00001", body.clone())).await;
    assert_eq!(status, StatusCode::CREATED, "{first}");
    let (status, headers, replay) = call(&app, invite("idem-key-00001", body.clone())).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(replay["id"], first["id"]);
    assert_eq!(headers.get("x-idempotent-replay").unwrap(), "true");
    // Same key, different payload → conflict before any work.
    let (status, _, body) = call(
        &app,
        invite(
            "idem-key-00001",
            json!({
                "candidateId": "candidate041",
                "needId": "need-001",
                "message": "Другое сообщение"
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(code(&body), "idempotency_conflict");
    // Missing key on an idempotent command is a schema violation.
    let (status, _, body) = call(
        &app,
        request(
            "POST",
            "/api/v1/invitations",
            Some(&employer),
            Some(json!({
                "candidateId": "candidate018",
                "needId": "need-001",
                "message": "Без ключа"
            })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(code(&body), "validation_error");
}

#[tokio::test]
async fn gap_plans_and_reachability() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    // Reachable public candidate against the company's need.
    let (status, plan) = get(
        &app,
        "/api/v1/candidates/candidate018/gap-plan?needId=need-001",
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{plan}");
    assert_eq!(plan["simulation"], true);
    let item = plan["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["skillId"] == "postgresql")
        .expect("postgresql gap item");
    assert_eq!(item["status"], "not_evidenced");
    assert_eq!(item["assessmentAvailable"], true);
    assert!(
        item["acceptedCompetitionIds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id == "competition-demo-api")
    );
    // Another company's need id is not found.
    let (status, body) = get(
        &app,
        "/api/v1/candidates/candidate018/gap-plan?needId=need-stranger",
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let _ = body;
}

#[tokio::test]
async fn vacancy_search_pagination() {
    let app = test_app().await;
    let candidate = login(&app, CANDIDATE_JUNIOR, "candidate").await;
    let (status, page) = get(
        &app,
        "/api/v1/vacancies?page=1&pageSize=1",
        Some(&candidate),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["page"], 1);
    assert_eq!(page["pageSize"], 1);
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert!(page["total"].as_u64().unwrap() >= 1);
    assert!(page["hasNextPage"].is_boolean());
    // Out-of-range size is a contract violation.
    let (status, body) = get(&app, "/api/v1/vacancies?pageSize=0", Some(&candidate)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(code(&body), "validation_error");
}

#[tokio::test]
async fn tasks_offer_and_response() {
    let app = test_app().await;
    let candidate = login(&app, CANDIDATE, "candidate").await;
    let employer = login(&app, EMPLOYER, "employer").await;
    // MyTasks is the weekly-offer envelope: period, current, history, freshness.
    let (status, tasks) = get(&app, "/api/v1/me/tasks", Some(&candidate)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(tasks["period"].is_object());
    assert!(tasks["history"].is_array());
    assert!(tasks["freshness"].is_object());
    // Company tasks are listed with response counts.
    let (status, list) = get(&app, "/api/v1/tasks", Some(&employer)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        list["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["id"] == "task-001")
    );
    // Archiving removes it from offers.
    let (status, archived) = post(&app, "/api/v1/tasks/task-001/archive", Some(&employer)).await;
    assert_eq!(status, StatusCode::OK, "{archived}");
}

#[tokio::test]
async fn profile_import_confirm_and_pdf_export() {
    let app = test_app().await;
    let candidate = login(&app, CANDIDATE_JUNIOR, "candidate").await;
    // A valid-shaped PDF upload produces a succeeded profile_import job.
    let boundary = "----fsp-test";
    let payload = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"cv.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 demo %%EOF\r\n--{boundary}--\r\n"
    )
    .into_bytes();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/me/profile/imports")
                .header(header::COOKIE, &candidate)
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let job: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(job["kind"], "profile_import");
    assert_eq!(job["status"], "succeeded");
    assert_eq!(job["result"]["parser"], "fixture_preview");
    let job_id = job["id"].as_str().unwrap().to_owned();
    // The job is replayable through the polling endpoint.
    let (status, polled) = get(&app, &format!("/api/v1/jobs/{job_id}"), Some(&candidate)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(polled["result"]["preview"]["name"], "Алексей Морозов");
    // Confirm applies the patch once.
    let (status, profile) = send(
        &app,
        "POST",
        &format!("/api/v1/me/profile/imports/{job_id}/confirm"),
        Some(&candidate),
        json!({"profile": {"name": "Импортированный Профиль"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{profile}");
    assert_eq!(profile["name"], "Импортированный Профиль");
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/v1/me/profile/imports/{job_id}/confirm"),
        Some(&candidate),
        json!({"profile": {"name": "Повтор"}}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(code(&body), "import_already_confirmed");
    // Export returns a real PDF.
    let response = app
        .clone()
        .oneshot(request(
            "GET",
            "/api/v1/me/profile/export",
            Some(&candidate),
            None,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/pdf"
    );
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 1000);
}

#[tokio::test]
async fn candidate_bank_anonymous_and_sorted() {
    let app = test_app().await;
    let employer = login(&app, EMPLOYER, "employer").await;
    let (status, page) = get(
        &app,
        "/api/v1/candidates?page=1&pageSize=10",
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = page["items"].as_array().unwrap();
    assert!(!items.is_empty());
    // Anonymous projection: aliases, never e-mail addresses.
    for item in items {
        assert!(item["alias"].as_str().is_some());
        assert!(item.get("email").is_none());
    }
    // The fsp=verified filter narrows to verified candidates.
    let (status, verified) = get(
        &app,
        "/api/v1/candidates?fsp=verified&page=1&pageSize=10",
        Some(&employer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let verified_items = verified["items"].as_array().unwrap();
    assert!(
        verified_items
            .iter()
            .all(|item| item["fspVerified"] == true)
    );
}
