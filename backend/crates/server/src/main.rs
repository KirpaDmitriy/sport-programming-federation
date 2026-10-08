//! Composition root: reads the configuration, wires adapters to the application and serves HTTP.

use std::env;
use std::error::Error;
use std::sync::Arc;

use fsp_application::{
    IntegrationError, PlatformRepository, PlatformService, VerificationDelivery,
};
use fsp_http::HttpConfig;
use fsp_integration_bifrost::BifrostGateway;
use fsp_integration_fsp_synthetic::HttpFsp;
use fsp_integration_github::GitHubApi;
use fsp_storage_postgres::PostgresRepository;
use tokio::net::TcpListener;
use tokio::signal;

const DEV_ORIGINS: &str = "http://127.0.0.1:5173,http://localhost:5173";

struct ConfiguredDelivery {
    code: String,
    mock: bool,
}

#[async_trait::async_trait]
impl VerificationDelivery for ConfiguredDelivery {
    fn code_for(&self) -> String {
        self.code.clone()
    }

    async fn deliver(&self, _email: &str, _code: &str) -> Result<(), IntegrationError> {
        if self.mock {
            // Demo mode "delivers" the fixed code; never log addresses or codes.
            tracing::info!("verification code issued (demo mailbox)");
            Ok(())
        } else {
            Err(IntegrationError {
                code: "verification_delivery_failed",
                message: "Отправка почты не настроена".into(),
            })
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
    // `successfulGradeChangeCooldownDays` from meta.assessmentPolicy: 0-365,
    // default 90; out-of-range values fall back rather than crash the boot.
    let grade_cooldown_days = env::var("FSP_GRADE_CHANGE_COOLDOWN_DAYS")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|days| *days <= 365)
        .unwrap_or(90);
    let mut platform = PlatformService::new(repository.clone(), delivery)
        .with_grade_cooldown_days(grade_cooldown_days)
        .with_fsp(Arc::new(
            HttpFsp::new(
                &env::var("FSP_SIMULATOR_URL").unwrap_or_else(|_| "http://127.0.0.1:4020".into()),
            )
            .map_err(|error| std::io::Error::other(error.message))?,
        ));
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
    if env::var("FSP_PDF_IMPORT").is_ok_and(|value| value == "1") {
        let pdf = fsp_integration_pdf::SandboxedPdf::default();
        pdf.probe()
            .await
            .map_err(|error| format!("PDF adapter: {}", error.message))?;
        platform = platform.with_pdf(Arc::new(pdf));
    }
    let service = Arc::new(platform);
    service.initialize().await.map_err(|error| error.message)?;
    // Expired challenges, sessions and stale idempotency markers are workload
    // the service layer cannot schedule on its own; sweep them once a minute.
    tokio::spawn(sweep_expired(repository.clone()));
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

async fn sweep_expired(repository: Arc<PostgresRepository>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        let at = chrono::Utc::now().to_rfc3339();
        if let Err(error) = repository.sweep_expired(&at).await {
            tracing::warn!(error = ?error, "expired-record sweep failed");
        }
    }
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
