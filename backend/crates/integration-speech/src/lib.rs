use std::time::Duration;

use async_trait::async_trait;
use base64::Engine;
use fsp_application::{
    IntegrationError, SpeechAudioView, SpeechRecognitionGateway, SpeechSynthesisGateway,
    SpeechTranscriptView,
};
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::json;

const MAX_AUDIO_BYTES: usize = 4 * 1024 * 1024;
const ACCEPTED_RECORDING_TYPES: [&str; 3] = ["audio/webm", "audio/mp4", "audio/ogg"];

pub struct GigaAmSpeechRecognition {
    client: Client,
    endpoint: Url,
}

impl GigaAmSpeechRecognition {
    pub fn new(endpoint: &str) -> Result<Self, IntegrationError> {
        Ok(Self {
            client: client_with_timeout(Duration::from_secs(45))?,
            endpoint: endpoint.parse().map_err(invalid_configuration)?,
        })
    }
}

#[derive(Deserialize)]
struct GigaAmTranscript {
    text: String,
    provider: String,
    duration_seconds: f32,
}

#[async_trait]
impl SpeechRecognitionGateway for GigaAmSpeechRecognition {
    async fn transcribe(
        &self,
        audio_base64: &str,
        mime_type: &str,
    ) -> Result<SpeechTranscriptView, IntegrationError> {
        if !ACCEPTED_RECORDING_TYPES.contains(&mime_type) {
            return Err(recognition_input_invalid());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(audio_base64)
            .map_err(|_| recognition_input_invalid())?;
        if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
            return Err(recognition_input_invalid());
        }
        let transcript = self
            .client
            .post(self.endpoint.clone())
            .header(reqwest::header::CONTENT_TYPE, mime_type)
            .body(bytes)
            .send()
            .await
            .map_err(unavailable)?
            .error_for_status()
            .map_err(unavailable)?
            .json::<GigaAmTranscript>()
            .await
            .map_err(|_| invalid_response())?;
        if transcript.text.trim().is_empty() || transcript.duration_seconds <= 0.0 {
            return Err(invalid_response());
        }
        Ok(SpeechTranscriptView {
            text: transcript.text,
            provider: transcript.provider,
            duration_seconds: transcript.duration_seconds,
        })
    }
}

pub struct XaiSpeech {
    client: Client,
    endpoint: Url,
    api_key: String,
    voice: String,
}

impl XaiSpeech {
    pub fn new(endpoint: &str, api_key: String, voice: String) -> Result<Self, IntegrationError> {
        Ok(Self {
            client: client()?,
            endpoint: endpoint.parse().map_err(invalid_configuration)?,
            api_key,
            voice,
        })
    }
}

#[async_trait]
impl SpeechSynthesisGateway for XaiSpeech {
    async fn synthesize(&self, text: &str) -> Result<SpeechAudioView, IntegrationError> {
        validate_text(text)?;
        let response = self
            .client
            .post(self.endpoint.clone())
            .bearer_auth(&self.api_key)
            .json(&json!({
                "text": text,
                "voice_id": self.voice,
                "language": "ru",
                "output_format": {"codec": "mp3", "sample_rate": 24000, "bit_rate": 128000}
            }))
            .send()
            .await
            .map_err(unavailable)?
            .error_for_status()
            .map_err(unavailable)?;
        let mime_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("audio/mpeg")
            .split(';')
            .next()
            .unwrap_or("audio/mpeg")
            .to_owned();
        let bytes = response.bytes().await.map_err(unavailable)?;
        if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
            return Err(invalid_response());
        }
        Ok(SpeechAudioView {
            audio_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            mime_type,
            provider: "xai".into(),
            voice: self.voice.clone(),
        })
    }
}

pub struct YandexSpeech {
    client: Client,
    endpoint: Url,
    api_key: String,
    voice: String,
    role: Option<String>,
    model: Option<String>,
}

pub struct SileroSpeech {
    client: Client,
    endpoint: Url,
    voice: String,
}

impl SileroSpeech {
    pub fn new(endpoint: &str, voice: String) -> Result<Self, IntegrationError> {
        Ok(Self {
            client: client()?,
            endpoint: endpoint.parse().map_err(invalid_configuration)?,
            voice,
        })
    }
}

#[async_trait]
impl SpeechSynthesisGateway for SileroSpeech {
    async fn synthesize(&self, text: &str) -> Result<SpeechAudioView, IntegrationError> {
        validate_text(text)?;
        let response = self
            .client
            .post(self.endpoint.clone())
            .json(&json!({
                "text": text,
                "voice": self.voice,
                "sample_rate": 24_000
            }))
            .send()
            .await
            .map_err(unavailable)?
            .error_for_status()
            .map_err(unavailable)?;
        let bytes = response.bytes().await.map_err(unavailable)?;
        if !valid_wav(&bytes) || bytes.len() > MAX_AUDIO_BYTES {
            return Err(invalid_response());
        }
        Ok(SpeechAudioView {
            audio_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            mime_type: "audio/wav".into(),
            provider: "silero_v5_5".into(),
            voice: self.voice.clone(),
        })
    }
}

impl YandexSpeech {
    pub fn new(
        endpoint: &str,
        api_key: String,
        voice: String,
        role: Option<String>,
        model: Option<String>,
    ) -> Result<Self, IntegrationError> {
        Ok(Self {
            client: client()?,
            endpoint: endpoint.parse().map_err(invalid_configuration)?,
            api_key,
            voice,
            role,
            model,
        })
    }
}

#[derive(Deserialize)]
struct YandexResponse {
    result: YandexResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YandexResult {
    audio_chunk: YandexAudioChunk,
}

#[derive(Deserialize)]
struct YandexAudioChunk {
    data: String,
}

#[async_trait]
impl SpeechSynthesisGateway for YandexSpeech {
    async fn synthesize(&self, text: &str) -> Result<SpeechAudioView, IntegrationError> {
        validate_text(text)?;
        if text.chars().count() > 250 {
            return Err(invalid_input());
        }
        let mut hints = vec![json!({"voice": self.voice})];
        if let Some(role) = &self.role {
            hints.push(json!({"role": role}));
        }
        let mut body = json!({
            "text": text,
            "hints": hints,
            "outputAudioSpec": {"containerAudio": {"containerAudioType": "MP3"}},
            "loudnessNormalizationType": "LUFS"
        });
        if let Some(model) = &self.model {
            body["model"] = json!(model);
        }
        let response = self
            .client
            .post(self.endpoint.clone())
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Api-Key {}", self.api_key),
            )
            .json(&body)
            .send()
            .await
            .map_err(unavailable)?
            .error_for_status()
            .map_err(unavailable)?
            .json::<YandexResponse>()
            .await
            .map_err(|_| invalid_response())?;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&response.result.audio_chunk.data)
            .map_err(|_| invalid_response())?;
        if decoded.is_empty() || decoded.len() > MAX_AUDIO_BYTES {
            return Err(invalid_response());
        }
        Ok(SpeechAudioView {
            audio_base64: response.result.audio_chunk.data,
            mime_type: "audio/mpeg".into(),
            provider: "yandex_speechkit".into(),
            voice: self.voice.clone(),
        })
    }
}

fn client() -> Result<Client, IntegrationError> {
    client_with_timeout(Duration::from_secs(20))
}

fn client_with_timeout(timeout: Duration) -> Result<Client, IntegrationError> {
    Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(invalid_configuration)
}

fn recognition_input_invalid() -> IntegrationError {
    IntegrationError {
        code: "speech_input_invalid",
        message: "Запись имеет неподдерживаемый формат или размер".into(),
    }
}

fn validate_text(text: &str) -> Result<(), IntegrationError> {
    if text.trim().is_empty() || text.chars().count() > 4_000 {
        return Err(invalid_input());
    }
    Ok(())
}

fn valid_wav(bytes: &[u8]) -> bool {
    bytes.len() >= 44 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE"
}

fn invalid_input() -> IntegrationError {
    IntegrationError {
        code: "speech_input_invalid",
        message: "Текст озвучивания имеет недопустимую длину".into(),
    }
}

fn invalid_configuration(_error: impl std::fmt::Display) -> IntegrationError {
    IntegrationError {
        code: "speech_not_configured",
        message: "Сервис озвучивания не настроен".into(),
    }
}

fn unavailable(_error: impl std::fmt::Display) -> IntegrationError {
    IntegrationError {
        code: "speech_unavailable",
        message: "Сервис озвучивания временно недоступен".into(),
    }
}

fn invalid_response() -> IntegrationError {
    IntegrationError {
        code: "speech_invalid_response",
        message: "Сервис озвучивания вернул некорректный ответ".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_oversized_text() {
        assert_eq!(validate_text(" ").unwrap_err().code, "speech_input_invalid");
        assert_eq!(
            validate_text(&"я".repeat(4_001)).unwrap_err().code,
            "speech_input_invalid"
        );
        assert!(validate_text("Нормальный вопрос").is_ok());
    }

    #[test]
    fn yandex_rejects_text_above_provider_limit() {
        let adapter = YandexSpeech::new(
            "https://example.com",
            "key".into(),
            "marina".into(),
            None,
            None,
        )
        .unwrap();
        let runtime = tokio::runtime::Runtime::new().unwrap();
        assert_eq!(
            runtime
                .block_on(adapter.synthesize(&"я".repeat(251)))
                .unwrap_err()
                .code,
            "speech_input_invalid"
        );
    }

    #[test]
    fn validates_wav_container_boundaries() {
        assert!(!valid_wav(&[]));
        assert!(!valid_wav(&[0; 44]));
        let mut wav = [0; 44];
        wav[..4].copy_from_slice(b"RIFF");
        wav[8..12].copy_from_slice(b"WAVE");
        assert!(valid_wav(&wav));
    }
}
