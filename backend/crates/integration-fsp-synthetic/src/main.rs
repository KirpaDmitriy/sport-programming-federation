use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let host = env::var("FSP_SIMULATOR_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port = env::var("FSP_SIMULATOR_PORT").unwrap_or_else(|_| "4020".into());
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    axum::serve(listener, fsp_integration_fsp_synthetic::router())
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

// systemd and Docker stop services with SIGTERM; local Ctrl-C remains supported.
async fn shutdown() {
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        result = tokio::signal::ctrl_c() => result.expect("listen for SIGINT"),
        () = terminate => {}
    }
}
