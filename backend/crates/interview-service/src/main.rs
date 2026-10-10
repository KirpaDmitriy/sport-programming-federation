use std::env;
use std::error::Error;
use std::sync::Arc;

use fsp_interview_service::engine::InterviewService;
use fsp_interview_service::http;
use fsp_interview_service::model::{BifrostInterviewModel, InterviewModel, OfflineModel};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt().init();
    let host = env::var("INTERVIEW_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = env::var("INTERVIEW_PORT")
        .unwrap_or_else(|_| "4030".into())
        .parse()?;
    let api_token = required_env("INTERVIEW_API_TOKEN")?;
    let model: Arc<dyn InterviewModel> = if let Some(chat_url) = optional_env("BIFROST_CHAT_URL") {
        Arc::new(
            BifrostInterviewModel::new(
                &chat_url,
                optional_env("BIFROST_API_KEY"),
                optional_env("INTERVIEW_BIFROST_MODEL")
                    .or_else(|| optional_env("BIFROST_MODEL"))
                    .unwrap_or_else(|| "openai/gpt-5-mini".into()),
            )
            .map_err(|_| "invalid Bifrost interview configuration")?,
        )
    } else {
        tracing::warn!("BIFROST_CHAT_URL is unset; using the explicit offline rubric model");
        Arc::new(OfflineModel)
    };
    let service = Arc::new(InterviewService::new(model));
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    tracing::info!(address = %listener.local_addr()?, "fsp-interview-service listening");
    axum::serve(listener, http::router(service, api_token))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error>> {
    optional_env(name).ok_or_else(|| format!("{name} is required").into())
}
