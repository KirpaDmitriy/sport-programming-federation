//! Composition root: reads the configuration, wires adapters to the application and serves HTTP.

use std::env;
use std::error::Error;
use std::sync::Arc;

use fsp_application::{PlatformService, VerificationDelivery};
use fsp_http::HttpConfig;
use fsp_storage_sqlite::SqliteRepository;
use tokio::net::TcpListener;
use tokio::signal;

const DEV_ORIGINS: &str = "http://127.0.0.1:5173,http://localhost:5173";

struct ConfiguredDelivery {
    code: String,
    mock: bool,
}

impl VerificationDelivery for ConfiguredDelivery {
    fn code_for(&self) -> String {
        self.code.clone()
    }

    fn deliver(&self, email: &str, code: &str) -> Result<(), String> {
        if self.mock {
            tracing::info!(email, code, "verification code issued");
            Ok(())
        } else {
            Err("Отправка почты не настроена".into())
        }
    }

    fn contract_name(&self) -> &'static str {
        if self.mock { "mock_mailbox" } else { "email" }
    }
}

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

    let database_path = env::var("FSP_DATABASE").unwrap_or_else(|_| "data/fsp.sqlite3".into());
    if let Some(parent) = std::path::Path::new(&database_path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let repository =
        Arc::new(SqliteRepository::open(database_path).map_err(|error| format!("{error:?}"))?);
    let mock = env::var("FSP_AUTH_MODE").unwrap_or_else(|_| "demo".into()) == "demo";
    let delivery = Arc::new(ConfiguredDelivery {
        code: env::var("FSP_DEMO_EMAIL_CODE").unwrap_or_else(|_| "123456".into()),
        mock,
    });
    let service = Arc::new(PlatformService::new(repository, delivery));
    service.initialize().map_err(|error| error.message)?;
    let secure_cookie = env::var("FSP_SECURE_COOKIE").is_ok_and(|value| value == "1");
    let app = fsp_http::router(
        HttpConfig {
            allowed_origins,
            secure_cookie,
        },
        service,
    );
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
