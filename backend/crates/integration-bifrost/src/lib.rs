use std::time::Duration;

use async_trait::async_trait;
use fsp_application::{IntegrationError, LlmGateway};
use fsp_domain::{
    ExtractedGraph, GraphExtractionRequest, RepositoryCompetitionMatch, RepositoryMatchRequest,
};
use reqwest::Client;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;

pub struct BifrostGateway {
    client: Client,
    chat_url: String,
    api_key: Option<String>,
    model: String,
}

impl BifrostGateway {
    pub fn new(
        chat_url: String,
        api_key: Option<String>,
        model: String,
    ) -> Result<Self, IntegrationError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(45))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(integration)?;
        Ok(Self {
            client,
            chat_url,
            api_key,
            model,
        })
    }

    async fn complete<T: DeserializeOwned>(
        &self,
        task: &str,
        input: &impl serde::Serialize,
    ) -> Result<T, IntegrationError> {
        let mut request = self.client.post(&self.chat_url).json(&json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": task},
                {"role": "user", "content": serde_json::to_string(input).map_err(integration)?}
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": 4096,
            "temperature": 0
        }));
        if let Some(api_key) = &self.api_key {
            request = request.bearer_auth(api_key);
        }
        let mut response = request
            .send()
            .await
            .map_err(integration)?
            .error_for_status()
            .map_err(integration)?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(integration)? {
            if bytes.len() + chunk.len() > 1024 * 1024 {
                return Err(IntegrationError {
                    code: "bifrost_invalid_response",
                    message: "Ответ сервиса анализа превышает допустимый размер".into(),
                });
            }
            bytes.extend_from_slice(&chunk);
        }
        let response: ChatResponse = serde_json::from_slice(&bytes).map_err(integration)?;
        let content = response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| IntegrationError {
                code: "bifrost_invalid_response",
                message: "Bifrost вернул пустой ответ".into(),
            })?;
        serde_json::from_str(&content).map_err(integration)
    }
}

#[async_trait]
impl LlmGateway for BifrostGateway {
    async fn extract_graph(
        &self,
        request: &GraphExtractionRequest,
    ) -> Result<ExtractedGraph, IntegrationError> {
        self.complete(
            "Return a JSON competence prerequisite graph with exactly this shape: \
             {\"nodes\":[{\"id\":string,\"kind\":\"role\"|\"skill\"|\"evidence\",\"label\":string,\
             \"skillId\":string|null,\"status\":\"confirmed\"|\"evidence\"|\"observed\"|\"insufficient\"|null,\
             \"evidenceReferences\":[string]}],\
             \"edges\":[{\"id\":string,\"from\":string,\"to\":string,\
             \"relation\":\"requires\"|\"supports\"|\"uses\",\"evidenceReferences\":[string]}]}. \
             Include one \"role\" node as the root, one \"skill\" node per evidenced skill, and \
             \"evidence\" nodes for the supporting references. Every node and edge must cite \
             evidenceReferences from the input. Do not infer facts without evidence.",
            request,
        )
        .await
    }

    async fn match_repository(
        &self,
        request: &RepositoryMatchRequest,
    ) -> Result<RepositoryCompetitionMatch, IntegrationError> {
        self.complete(
            "Return JSON that scores repository relevance to the competition from 0 to 1. Cite only provided evidence references.",
            request,
        )
        .await
    }
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    content: Option<String>,
}

fn integration(_error: impl std::fmt::Display) -> IntegrationError {
    IntegrationError {
        code: "bifrost_unavailable",
        message: "Сервис анализа временно недоступен".into(),
    }
}
