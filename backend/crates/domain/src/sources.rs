use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceProvider {
    Github,
    Fsp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryMetrics {
    pub stars: u64,
    pub forks: u64,
    pub open_issues: u64,
    pub size_kib: u64,
    pub pushed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzedRepository {
    pub id: String,
    pub name: String,
    pub url: String,
    pub technologies: Vec<String>,
    pub metrics: RepositoryMetrics,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubAnalysis {
    pub username: String,
    pub repositories: Vec<AnalyzedRepository>,
    pub active_days: u32,
    pub observed_from: Option<String>,
    pub observed_to: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FspParticipation {
    pub account_label: String,
    pub verified: bool,
    pub competition_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRecord {
    pub id: String,
    pub candidate_id: String,
    pub provider: SourceProvider,
    pub synthetic: bool,
    pub active_job_id: Option<String>,
    pub account_label: Option<String>,
    pub last_synced_at: Option<String>,
    pub analysis: Option<GitHubAnalysis>,
    pub verified_participation: bool,
    pub competition_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRecord {
    pub id: String,
    pub owner_id: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub result_source_id: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}
