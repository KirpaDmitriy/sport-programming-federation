//! Inbound HTTP adapter. It owns the transport rules of `contracts/API_INTEGRATION.md` (origin check,
//! request IDs, the error envelope) and translates requests into calls of the application layer.

mod error;

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::header::{CACHE_CONTROL, ORIGIN, X_CONTENT_TYPE_OPTIONS};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use uuid::Uuid;

pub use error::{ApiError, Detail};

const REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Debug, Clone)]
pub struct HttpConfig {
    /// Browser origins allowed on requests that carry an `Origin` header.
    pub allowed_origins: Vec<String>,
}

pub fn router(config: HttpConfig) -> Router {
    Router::new()
        .route("/health", get(health))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(middleware::from_fn_with_state(Arc::new(config), transport))
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

async fn not_found() -> ApiError {
    ApiError::not_found("Маршрут не найден")
}

/// Rejects foreign origins, renders every error with the request's ID and sets the common headers.
async fn transport(
    State(config): State<Arc<HttpConfig>>,
    request: Request,
    next: Next,
) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let foreign = request.headers().get(ORIGIN).is_some_and(|origin| {
        !config
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
    use axum::body::Body;
    use axum::http::{Method, StatusCode};
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::*;

    async fn call(
        method: Method,
        path: &str,
        origin: Option<&str>,
    ) -> (StatusCode, Option<String>, Value) {
        let app = router(HttpConfig {
            allowed_origins: vec!["http://127.0.0.1:5173".into()],
        });
        let mut request = Request::builder().method(method).uri(path);
        if let Some(origin) = origin {
            request = request.header(ORIGIN, origin);
        }
        let response = app
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let request_id = response
            .headers()
            .get(REQUEST_ID)
            .map(|value| value.to_str().unwrap().to_owned());
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, request_id, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test]
    async fn health_matches_the_contract() {
        let (status, request_id, body) = call(Method::GET, "/health", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(request_id.is_some());
        assert_eq!(
            body,
            json!({ "status": "ok", "service": "fsp-career-api", "version": "0.1.0" })
        );
    }

    #[tokio::test]
    async fn unknown_routes_use_the_error_envelope() {
        let (status, request_id, body) = call(Method::GET, "/api/v1/unknown", None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["code"], "not_found");
        assert_eq!(body["details"], json!([]));
        assert_eq!(body["requestId"].as_str(), request_id.as_deref());

        let (status, _, body) = call(Method::DELETE, "/health", None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["code"], "not_found");
    }

    #[tokio::test]
    async fn only_configured_origins_are_accepted() {
        let (status, _, body) = call(Method::GET, "/health", Some("https://evil.example")).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["code"], "origin_not_allowed");

        let (status, _, _) = call(Method::GET, "/health", Some("http://127.0.0.1:5173")).await;
        assert_eq!(status, StatusCode::OK);
    }
}
