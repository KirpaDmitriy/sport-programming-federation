//! Bounded digital-PDF extraction. Uploaded bytes only reach Poppler inside
//! an empty mount/network/user/PID namespace, never the API's address space.
use std::process::Stdio;
use std::time::Duration;

use async_trait::async_trait;
use fsp_application::{IntegrationError, PdfGateway};
use fsp_domain::PdfPage;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Semaphore;

const MAX_TEXT: usize = 64 * 1024;
const MAX_PAGES: usize = 20;

pub struct SandboxedPdf {
    slots: Semaphore,
}

impl Default for SandboxedPdf {
    fn default() -> Self {
        Self {
            slots: Semaphore::new(2),
        }
    }
}

fn sandbox() -> Command {
    let mut command = Command::new("/usr/bin/bwrap");
    command
        .args([
            "--unshare-all",
            "--die-with-parent",
            "--new-session",
            "--ro-bind",
            "/usr",
            "/usr",
            "--symlink",
            "usr/lib",
            "/lib",
            "--symlink",
            "usr/lib64",
            "/lib64",
            "--proc",
            "/proc",
            "--dev",
            "/dev",
            "--tmpfs",
            "/tmp",
            "--chdir",
            "/tmp",
            "--clearenv",
            "--setenv",
            "PATH",
            "/usr/bin",
            "--",
            "/usr/bin/prlimit",
            "--as=268435456",
            "--cpu=3",
            "--fsize=4194304",
            "--nofile=32",
            "--",
            "/usr/bin/pdftotext",
        ])
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    command
}

impl SandboxedPdf {
    pub async fn probe(&self) -> Result<(), IntegrationError> {
        let mut command = sandbox();
        command.arg("-v");
        match tokio::time::timeout(Duration::from_secs(5), command.status()).await {
            Ok(Ok(status)) if status.success() => Ok(()),
            _ => Err(error(
                "pdf_parser_unavailable",
                "Сервис разбора PDF недоступен",
            )),
        }
    }
}

#[async_trait]
impl PdfGateway for SandboxedPdf {
    async fn extract(&self, bytes: &[u8]) -> Result<Vec<PdfPage>, IntegrationError> {
        let _permit = self
            .slots
            .try_acquire()
            .map_err(|_| error("pdf_parser_busy", "Разбор PDF занят. Повторите позже"))?;
        if bytes.is_empty() || bytes.len() > 2 * 1024 * 1024 {
            return Err(error(
                "invalid_pdf",
                "Размер PDF должен быть от 1 байта до 2 МиБ",
            ));
        }
        let mut child = sandbox()
            .args(["-enc", "UTF-8", "-f", "1", "-l", "21", "-", "-"])
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| error("pdf_parser_unavailable", "Сервис разбора PDF недоступен"))?;
        let mut stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let run = async {
            let write = async {
                stdin.write_all(bytes).await?;
                stdin.shutdown().await?;
                drop(stdin);
                Ok::<_, std::io::Error>(())
            };
            let read = async {
                let mut output = Vec::new();
                stdout
                    .take((MAX_TEXT + 1) as u64)
                    .read_to_end(&mut output)
                    .await?;
                Ok::<_, std::io::Error>(output)
            };
            let (_, output) = tokio::try_join!(write, read).map_err(|_| invalid())?;
            if output.len() > MAX_TEXT {
                return Err(error(
                    "pdf_text_too_large",
                    "В PDF слишком много текста. Загрузите краткое резюме",
                ));
            }
            let status = child.wait().await.map_err(|_| invalid())?;
            if !status.success() {
                return Err(invalid());
            }
            parse_text(output)
        };
        match tokio::time::timeout(Duration::from_secs(5), run).await {
            Ok(result) => result,
            Err(_) => Err(error(
                "pdf_parser_timeout",
                "Разбор PDF занял слишком много времени. Загрузите упрощённый файл",
            )),
        }
        // Dropping Child kills the namespace's supervisor and all parser children.
    }
}

fn parse_text(bytes: Vec<u8>) -> Result<Vec<PdfPage>, IntegrationError> {
    let text = String::from_utf8(bytes).map_err(|_| invalid())?;
    let text = text.strip_suffix('\u{000c}').unwrap_or(&text);
    let pages: Vec<_> = text
        .split('\u{000c}')
        .enumerate()
        .map(|(index, text)| PdfPage {
            page: (index + 1) as u16,
            text: text.trim().to_string(),
        })
        .collect();
    if pages.len() > MAX_PAGES {
        return Err(error(
            "pdf_too_many_pages",
            "Резюме должно содержать не более 20 страниц",
        ));
    }
    if pages.iter().all(|page| page.text.trim().is_empty()) {
        return Err(error(
            "pdf_text_unavailable",
            "В PDF нет доступного текста. Сохраните текстовый PDF или заполните профиль вручную",
        ));
    }
    Ok(pages)
}

fn invalid() -> IntegrationError {
    error(
        "pdf_parse_failed",
        "Не удалось прочитать PDF. Проверьте файл, снимите пароль или сохраните его заново",
    )
}

fn error(code: &'static str, message: &str) -> IntegrationError {
    IntegrationError {
        code,
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_limits_and_empty_text_are_not_success() {
        assert_eq!(
            parse_text(b"\x0c".to_vec()).unwrap_err().code,
            "pdf_text_unavailable"
        );
        assert_eq!(
            parse_text("text\x0c".repeat(21).into_bytes())
                .unwrap_err()
                .code,
            "pdf_too_many_pages"
        );
        let pages = parse_text("Имя\x0cRust\x0c".as_bytes().to_vec()).unwrap();
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[1].page, 2);
    }

    #[tokio::test]
    async fn corrupt_document_never_produces_a_preview() {
        let result = SandboxedPdf::default()
            .extract(b"%PDF-1.4 invalid %%EOF")
            .await;
        assert!(result.is_err());
    }
}
