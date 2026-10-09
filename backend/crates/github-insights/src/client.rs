//! GitHub transport: GraphQL for structured data, REST patches for commit time zones.
//!
//! The client bounds concurrency, honors primary and secondary rate limits and maps GitHub's
//! GraphQL execution timeout (HTTP 502/504) to [`FetchError::Timeout`] so callers can degrade.

use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client, Response, StatusCode};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::sync::Semaphore;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FetchError {
    NotFound,
    Unauthorized,
    RateLimited { retry_after_seconds: u64 },
    Timeout,
    Unavailable,
}

pub struct GitHubClient {
    http: Client,
    token: String,
    graphql_url: String,
    rest_url: String,
    permits: Arc<Semaphore>,
}

impl GitHubClient {
    pub fn new(token: String) -> Result<Self, reqwest::Error> {
        Self::with_endpoints(
            token,
            "https://api.github.com/graphql".into(),
            "https://api.github.com".into(),
        )
    }

    pub fn with_endpoints(
        token: String,
        graphql_url: String,
        rest_url: String,
    ) -> Result<Self, reqwest::Error> {
        let http = Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("fsp-github-insights/0.1")
            .build()?;
        Ok(Self {
            http,
            token,
            graphql_url,
            rest_url,
            // GitHub allows 100 concurrent requests per token; stay well below it.
            permits: Arc::new(Semaphore::new(12)),
        })
    }

    /// Runs a query and returns `data`. Partial data with field errors is accepted; a missing
    /// `data` object is an error.
    pub async fn graphql<T: DeserializeOwned>(
        &self,
        query: &str,
        variables: Value,
    ) -> Result<T, FetchError> {
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| FetchError::Unavailable)?;
        let body = json!({ "query": query, "variables": variables });
        let mut attempt = 0;
        loop {
            attempt += 1;
            let response = self
                .http
                .post(&self.graphql_url)
                .bearer_auth(&self.token)
                .header("Accept", "application/vnd.github+json")
                .json(&body)
                .send()
                .await;
            let response = match response {
                Ok(response) => response,
                Err(error) if error.is_timeout() => return Err(FetchError::Timeout),
                Err(_) if attempt < 2 => continue,
                Err(_) => return Err(FetchError::Unavailable),
            };
            match classify(&response) {
                Some(FetchError::RateLimited {
                    retry_after_seconds,
                }) if attempt < 2 && retry_after_seconds <= 3 => {
                    tokio::time::sleep(Duration::from_secs(retry_after_seconds.max(1))).await;
                    continue;
                }
                // GitHub's 10-second execution limit: a repeated query often completes from its cache.
                Some(FetchError::Timeout) if attempt < 2 => continue,
                Some(error) => return Err(error),
                None => {}
            }
            let envelope = response
                .json::<Envelope<T>>()
                .await
                .map_err(|_| FetchError::Unavailable)?;
            return match envelope.data {
                Some(data) => Ok(data),
                None if envelope
                    .errors
                    .iter()
                    .any(|error| error.kind.as_deref() == Some("NOT_FOUND")) =>
                {
                    Err(FetchError::NotFound)
                }
                None if envelope
                    .errors
                    .iter()
                    .any(|error| error.kind.as_deref() == Some("RATE_LIMITED")) =>
                {
                    Err(FetchError::RateLimited {
                        retry_after_seconds: 60,
                    })
                }
                None => Err(FetchError::Unavailable),
            };
        }
    }

    /// GETs a REST resource as JSON.
    pub async fn rest<T: DeserializeOwned>(&self, path: &str) -> Result<T, FetchError> {
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| FetchError::Unavailable)?;
        let response = self
            .http
            .get(format!("{}{path}", self.rest_url))
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    FetchError::Timeout
                } else {
                    FetchError::Unavailable
                }
            })?;
        if let Some(error) = classify(&response) {
            return Err(error);
        }
        response.json().await.map_err(|_| FetchError::Unavailable)
    }

    /// Reads the original author UTC offset, in minutes, from the commit's patch header.
    ///
    /// GitHub's JSON APIs normalize commit dates to UTC; only the `Date:` header of the
    /// mailbox-format patch keeps the author's offset. The body is streamed and abandoned after the
    /// header, so large diffs are never downloaded. The e-mail header is ignored.
    pub async fn commit_offset_minutes(
        &self,
        name_with_owner: &str,
        oid: &str,
    ) -> Result<Option<i32>, FetchError> {
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| FetchError::Unavailable)?;
        let mut response = self
            .http
            .get(format!(
                "{}/repos/{name_with_owner}/commits/{oid}",
                self.rest_url
            ))
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github.patch")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    FetchError::Timeout
                } else {
                    FetchError::Unavailable
                }
            })?;
        if let Some(error) = classify(&response) {
            return Err(error);
        }
        let mut header = Vec::new();
        while header.len() < 16 * 1024 {
            match response.chunk().await {
                Ok(Some(chunk)) => header.extend_from_slice(&chunk),
                Ok(None) => break,
                Err(_) => return Err(FetchError::Unavailable),
            }
            if let Some(offset) = patch_offset(&header) {
                return Ok(Some(offset));
            }
            if header.windows(2).any(|pair| pair == b"\n\n") {
                break;
            }
        }
        Ok(patch_offset(&header))
    }
}

fn classify(response: &Response) -> Option<FetchError> {
    let status = response.status();
    if status.is_success() {
        return None;
    }
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
    };
    Some(match status {
        StatusCode::NOT_FOUND | StatusCode::UNPROCESSABLE_ENTITY => FetchError::NotFound,
        StatusCode::UNAUTHORIZED => FetchError::Unauthorized,
        StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS => {
            if let Some(seconds) = header("retry-after") {
                FetchError::RateLimited {
                    retry_after_seconds: seconds,
                }
            } else if header("x-ratelimit-remaining") == Some(0) {
                let now = chrono::Utc::now().timestamp().max(0) as u64;
                FetchError::RateLimited {
                    retry_after_seconds: header("x-ratelimit-reset")
                        .map_or(60, |reset| reset.saturating_sub(now).max(1)),
                }
            } else if status == StatusCode::TOO_MANY_REQUESTS {
                // A secondary limit without headers: wait at least a minute.
                FetchError::RateLimited {
                    retry_after_seconds: 60,
                }
            } else {
                // A plain 403 (for example a disabled repository) concerns one resource only.
                FetchError::Unavailable
            }
        }
        StatusCode::BAD_GATEWAY | StatusCode::GATEWAY_TIMEOUT => FetchError::Timeout,
        _ => FetchError::Unavailable,
    })
}

/// Parses `Date: Thu, 8 Oct 2026 23:15:00 +0200` from the patch header block.
pub(crate) fn patch_offset(header: &[u8]) -> Option<i32> {
    let text = String::from_utf8_lossy(header);
    let headers = text.split("\n\n").next().unwrap_or_default();
    let line = headers
        .lines()
        .find_map(|line| line.strip_prefix("Date: "))?;
    let date = chrono::DateTime::parse_from_rfc2822(line.trim()).ok()?;
    Some(date.offset().local_minus_utc() / 60)
}

#[derive(Deserialize)]
struct Envelope<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Deserialize)]
struct GraphQlError {
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_offsets_keep_the_author_time_zone() {
        let patch = b"From 1234 Mon Sep 17 00:00:00 2001\nFrom: Someone <x@example.invalid>\nDate: Thu, 8 Oct 2026 23:15:00 +0200\nSubject: [PATCH] test\n\n---\n";
        assert_eq!(patch_offset(patch), Some(120));
        let west = b"From: a\nDate: Mon, 21 Sep 2026 20:41:57 -0700\n\nbody";
        assert_eq!(patch_offset(west), Some(-420));
        assert_eq!(
            patch_offset(b"From: a\n\nDate: Mon, 21 Sep 2026 20:41:57 -0700"),
            None
        );
    }
}
