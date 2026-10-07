//! Composition root: reads the configuration, wires adapters to the application and serves HTTP.

use std::env;
use std::error::Error;
use std::sync::Arc;

use fsp_application::{PlatformService, VerificationDelivery};
use fsp_http::HttpConfig;
use fsp_integration_bifrost::BifrostGateway;
use fsp_integration_fsp_synthetic::SyntheticFsp;
use fsp_integration_github::GitHubApi;
use fsp_storage_postgres::PostgresRepository;
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

    fn deliver(&self, _email: &str, _code: &str) -> Result<(), String> {
        if self.mock {
            // Demo mode "delivers" the fixed code; never log addresses or codes.
            tracing::info!("verification code issued (demo mailbox)");
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

    let database_url =
        env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://fsp:fsp@127.0.0.1:5434/fsp".into());
    let repository = Arc::new(
        PostgresRepository::connect(&database_url)
            .await
            .map_err(|error| format!("{error:?}"))?,
    );
    let mock = env::var("FSP_AUTH_MODE").unwrap_or_else(|_| "demo".into()) == "demo";
    let delivery = Arc::new(ConfiguredDelivery {
        code: env::var("FSP_DEMO_EMAIL_CODE").unwrap_or_else(|_| "123456".into()),
        mock,
    });
    let mut platform = PlatformService::new(repository, delivery).with_fsp(Arc::new(SyntheticFsp));
    if let (Some(client_id), Some(client_secret)) = (
        nonempty_env("GITHUB_CLIENT_ID"),
        nonempty_env("GITHUB_CLIENT_SECRET"),
    ) {
        let github = GitHubApi::new(client_id, client_secret)
            .map_err(|error| format!("GitHub adapter: {}", error.message))?;
        platform = platform.with_github(Arc::new(github));
    }
    if let Some(chat_url) = nonempty_env("BIFROST_CHAT_URL") {
        let bifrost = BifrostGateway::new(
            chat_url,
            nonempty_env("BIFROST_API_KEY"),
            nonempty_env("BIFROST_MODEL").unwrap_or_else(|| "openai/gpt-5-mini".into()),
        )
        .map_err(|error| format!("Bifrost adapter: {}", error.message))?;
        platform = platform.with_llm(Arc::new(bifrost));
    }
    let service = Arc::new(platform);
    service.initialize().await.map_err(|error| error.message)?;
    let secure_cookie = env::var("FSP_SECURE_COOKIE").is_ok_and(|value| value == "1");
    let public_web_url =
        env::var("FSP_PUBLIC_WEB_URL").unwrap_or_else(|_| "http://127.0.0.1:5173".into());
    let github_callback_url = env::var("GITHUB_CALLBACK_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8080/api/v1/integrations/github/callback".into());
    let app = fsp_http::router(
        HttpConfig {
            allowed_origins,
            secure_cookie,
            public_web_url,
            github_callback_url,
            static_dir: nonempty_env("FSP_STATIC_DIR").map(Into::into),
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

fn nonempty_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
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
