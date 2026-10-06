use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmEvidence {
    pub reference: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphExtractionRequest {
    pub schema_version: &'static str,
    pub subject: String,
    pub evidence: Vec<LlmEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryMatchRequest {
    pub schema_version: &'static str,
    pub repository_reference: String,
    pub repository_facts: String,
    pub competition_reference: String,
    pub competition_facts: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtractedGraph {
    pub nodes: Vec<ExtractedGraphNode>,
    pub edges: Vec<ExtractedGraphEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtractedGraphNode {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub skill_id: Option<String>,
    pub status: Option<String>,
    pub evidence_references: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtractedGraphEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relation: String,
    pub evidence_references: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryCompetitionMatch {
    pub score: f32,
    pub explanation: String,
    pub evidence_references: Vec<String>,
}
