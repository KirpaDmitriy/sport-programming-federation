use std::env;
use std::sync::Arc;

use fsp_github_insights::client::GitHubClient;
use fsp_github_insights::collect::Limits;
use fsp_github_insights::{InsightsState, router};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().init();
    let host = env::var("FSP_GITHUB_INSIGHTS_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port = env::var("FSP_GITHUB_INSIGHTS_PORT").unwrap_or_else(|_| "4030".into());
    // A token is required by GitHub's GraphQL API. Without one the service stays up and reports
    // `missing_token`, so the career API can show the integration as unavailable.
    let client = match env::var("GITHUB_TOKEN") {
        Ok(token) if !token.trim().is_empty() => Some(GitHubClient::new(token.trim().into())?),
        _ => {
            tracing::warn!("GITHUB_TOKEN is not set; reports are unavailable");
            None
        }
    };
    let state = Arc::new(InsightsState::new(client, Limits::default()));
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    tracing::info!(address = %listener.local_addr()?, "fsp-github-insights listening");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
