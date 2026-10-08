use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let host = env::var("FSP_SIMULATOR_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port = env::var("FSP_SIMULATOR_PORT").unwrap_or_else(|_| "4020".into());
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    axum::serve(listener, fsp_integration_fsp_synthetic::router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
