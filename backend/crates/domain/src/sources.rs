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
    /// `source_sync`, `checks`, `assessment` or `profile_import` — the
    /// contract's `Job.kind` discriminator.
    pub kind: String,
    pub status: String,
    /// Owning candidate when the work mutates a candidate profile; the consent
    /// gate is checked against it before the job body runs.
    pub candidate_id: Option<String>,
    /// Assessment the job reports on, for `checks` and `assessment` kinds.
    pub assessment_id: Option<String>,
    /// Assessment revision the `checks` job was launched against; a later
    /// answer save makes the run stale.
    pub input_revision: Option<u64>,
    /// Serialized result payload (`Job.result` in the contract).
    pub result_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub result_source_id: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}
