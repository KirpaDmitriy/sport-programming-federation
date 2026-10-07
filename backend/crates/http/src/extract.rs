//! Contract-faithful extractors: every rejection is an `ApiError`, never a raw
//! axum response, so the envelope in [`crate::error`] is the only error shape.

use std::collections::HashSet;

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, FromRequestParts, Path, Query, Request};
use axum::http::request::Parts;
use axum::http::{StatusCode, header::CONTENT_TYPE};
use serde::de::DeserializeOwned;

use crate::error::{ApiError, Detail};

/// `application/json` bodies. Mirrors the mock: strict content type, `invalid_json`
/// on malformed input, `validation_error` with `details` on schema mismatches and
/// `body_too_large` past the body limit.
pub struct ContractJson<T>(pub T);

impl<S, T> FromRequest<S> for ContractJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let content_type = request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if content_type.split(';').next().map(str::trim) != Some("application/json") {
            return Err(ApiError::new(
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "json_required",
                "Ожидается application/json",
            ));
        }
        match Json::<T>::from_request(request, state).await {
            Ok(Json(value)) => Ok(Self(value)),
            Err(rejection) => Err(json_rejection(rejection)),
        }
    }
}

fn json_rejection(rejection: JsonRejection) -> ApiError {
    match rejection {
        JsonRejection::MissingJsonContentType(_) => ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "json_required",
            "Ожидается application/json",
        ),
        JsonRejection::JsonDataError(error) => ApiError::new(
            StatusCode::BAD_REQUEST,
            "validation_error",
            "Запрос не соответствует контракту",
        )
        .with_details(vec![data_detail(&error)]),
        other if other.status() == StatusCode::PAYLOAD_TOO_LARGE => ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "body_too_large",
            "Файл или запрос превышает допустимый размер",
        ),
        _ => ApiError::new(StatusCode::BAD_REQUEST, "invalid_json", "Некорректный JSON"),
    }
}

fn data_detail(error: &axum::extract::rejection::JsonDataError) -> Detail {
    let mut current: Option<&(dyn std::error::Error + 'static)> = Some(error);
    while let Some(error) = current {
        if let Some(target) = error.downcast_ref::<serde_path_to_error::Error<serde_json::Error>>()
        {
            return Detail {
                path: format!("/{}", target.path()),
                message: target.inner().to_string(),
            };
        }
        current = error.source();
    }
    Detail {
        path: "/".to_owned(),
        message: error.to_string(),
    }
}

/// Query strings. Rejects repeated keys with `duplicate_query_parameter` before
/// deserialization, mirroring the mock, then maps schema mismatches to
/// `validation_error`.
pub struct ContractQuery<T>(pub T);

impl<S, T> FromRequestParts<S> for ContractQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        reject_duplicate_query(parts.uri.query().unwrap_or_default())?;
        Query::<T>::from_request_parts(parts, state)
            .await
            .map(|Query(value)| Self(value))
            .map_err(|rejection| {
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "validation_error",
                    "Запрос не соответствует контракту",
                )
                .with_details(vec![Detail {
                    path: "/query".to_owned(),
                    message: rejection.body_text(),
                }])
            })
    }
}

/// `400 duplicate_query_parameter` when any key repeats. Runs inside `ContractQuery`
/// and on bodyless routes through [`reject_duplicate_query_middleware`].
pub fn reject_duplicate_query(query: &str) -> Result<(), ApiError> {
    let mut seen = HashSet::new();
    for (key, _) in form_urlencoded::parse(query.as_bytes()) {
        if !seen.insert(key.into_owned()) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "duplicate_query_parameter",
                "Параметр запроса нельзя повторять",
            ));
        }
    }
    Ok(())
}

/// `Idempotency-Key` header on commands the contract marks idempotent:
/// required, 8–128 characters; violations are `validation_error` like the
/// mock's header schema.
pub struct IdempotencyKey(pub String);

impl<S> FromRequestParts<S> for IdempotencyKey
where
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let value = parts
            .headers
            .get("idempotency-key")
            .and_then(|value| value.to_str().ok())
            .map(str::trim);
        match value {
            Some(key) if (8..=128).contains(&key.len()) => Ok(Self(key.to_owned())),
            Some(_) => Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "validation_error",
                "Запрос не соответствует контракту",
            )
            .with_details(vec![Detail {
                path: "/Idempotency-Key".to_owned(),
                message: "must NOT have fewer than 8 characters".to_owned(),
            }])),
            None => Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "validation_error",
                "Запрос не соответствует контракту",
            )
            .with_details(vec![Detail {
                path: "/".to_owned(),
                message: "must have required property 'Idempotency-Key'".to_owned(),
            }])),
        }
    }
}

/// Path parameters; a decode failure is `400 invalid_path`, as in the mock.
pub struct ContractPath<T>(pub T);

impl<S, T> FromRequestParts<S> for ContractPath<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Send,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Path::<T>::from_request_parts(parts, state)
            .await
            .map(|Path(value)| Self(value))
            .map_err(|_| {
                ApiError::new(StatusCode::BAD_REQUEST, "invalid_path", "Некорректный путь")
            })
    }
}
