//! Composition root: reads the configuration, wires adapters to the application and serves HTTP.

use std::env;
use std::error::Error;

use fsp_http::HttpConfig;
use tokio::net::TcpListener;
use tokio::signal;

const DEV_ORIGINS: &str = "http://127.0.0.1:5173,http://localhost:5173";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt().init();

    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let origins = env::var("FSP_ALLOWED_ORIGINS").unwrap_or_else(|_| DEV_ORIGINS.into());
    let allowed_origins = origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(String::from)
        .collect();

    let app = fsp_http::router(HttpConfig { allowed_origins });
    let listener = TcpListener::bind((host.as_str(), port)).await?;
    tracing::info!(address = %listener.local_addr()?, "fsp-career-api listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let interrupt = async {
        signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut stream) = signal::unix::signal(signal::unix::SignalKind::terminate()) {
            stream.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
}
