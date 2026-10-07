use async_trait::async_trait;
use fsp_domain::{
    Account, CandidateIndexRecord, CandidateProfile, Company, ExtractedGraph, FspParticipation,
    GitHubAnalysis, GraphExtractionRequest, HiringNeedRecord, JobRecord,
    RepositoryCompetitionMatch, RepositoryMatchRequest, Role, SourceRecord,
};

use crate::PendingChallenge;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConsumeChallenge {
    Consumed,
    Missing,
    Used,
    Expired,
    Locked,
    WrongCode,
}

#[derive(Debug)]
pub enum RepositoryError {
    Conflict,
    Storage(String),
}

pub trait PlatformRepository: Send + Sync {
    fn account_by_email(&self, email: &str) -> Result<Option<Account>, RepositoryError>;
    fn account_by_id(&self, account_id: &str) -> Result<Option<Account>, RepositoryError>;
    fn create_account(&self, account: &Account, now: &str) -> Result<(), RepositoryError>;
    fn create_candidate(&self, profile: &CandidateProfile) -> Result<(), RepositoryError>;
    fn create_company(&self, company: &Company) -> Result<(), RepositoryError>;
    fn save_challenge(&self, challenge: &PendingChallenge) -> Result<(), RepositoryError>;
    fn consume_challenge(
        &self,
        challenge_id: &str,
        code_hash: &str,
        now: &str,
    ) -> Result<(ConsumeChallenge, Option<Account>), RepositoryError>;
    fn create_session(
        &self,
        token_hash: &str,
        account_id: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError>;
    fn account_for_session(
        &self,
        token_hash: &str,
        now: &str,
    ) -> Result<Option<Account>, RepositoryError>;
    fn delete_session(&self, token_hash: &str) -> Result<(), RepositoryError>;
    fn candidate(&self, candidate_id: &str) -> Result<Option<CandidateProfile>, RepositoryError>;
    fn save_candidate(&self, profile: &CandidateProfile) -> Result<(), RepositoryError>;
    fn company(&self, company_id: &str) -> Result<Option<Company>, RepositoryError>;
    fn save_company(&self, company: &Company) -> Result<(), RepositoryError>;
    fn candidates(&self) -> Result<Vec<CandidateIndexRecord>, RepositoryError>;
    /// Persists the derived candidate index (skills, visibility flags); the
    /// row is created on first save when seeding missed the candidate.
    fn save_candidate_index(&self, record: &CandidateIndexRecord) -> Result<(), RepositoryError>;
    fn needs(&self, company_id: &str) -> Result<Vec<HiringNeedRecord>, RepositoryError>;
    fn need(
        &self,
        company_id: &str,
        need_id: &str,
    ) -> Result<Option<HiringNeedRecord>, RepositoryError>;
    fn save_need(&self, need: &HiringNeedRecord) -> Result<(), RepositoryError>;
    fn delete_need(&self, company_id: &str, need_id: &str) -> Result<(), RepositoryError>;
    /// Published needs across all companies, i.e. the vacancy projection.
    fn published_needs(&self) -> Result<Vec<HiringNeedRecord>, RepositoryError>;
    fn shortlists(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ShortlistRecord>, RepositoryError>;
    fn shortlist(
        &self,
        company_id: &str,
        shortlist_id: &str,
    ) -> Result<Option<fsp_domain::ShortlistRecord>, RepositoryError>;
    fn save_shortlist(
        &self,
        shortlist: &fsp_domain::ShortlistRecord,
    ) -> Result<(), RepositoryError>;
    fn delete_shortlist(&self, company_id: &str, shortlist_id: &str)
    -> Result<(), RepositoryError>;
    /// Invitations sent by a company, in creation order.
    fn invitations(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError>;
    /// Invitations addressed to a candidate, in creation order.
    fn candidate_invitations(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError>;
    /// Unscoped lookup; the service applies the caller's tenancy rule.
    fn invitation(
        &self,
        invitation_id: &str,
    ) -> Result<Option<fsp_domain::InvitationRecord>, RepositoryError>;
    fn save_invitation(
        &self,
        invitation: &fsp_domain::InvitationRecord,
    ) -> Result<(), RepositoryError>;
    fn disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<Option<fsp_domain::DisclosureRecord>, RepositoryError>;
    fn save_disclosure(
        &self,
        disclosure: &fsp_domain::DisclosureRecord,
    ) -> Result<(), RepositoryError>;
    fn delete_disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<(), RepositoryError>;
    /// Applications addressed to a company's needs.
    fn company_applications(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError>;
    /// Applications sent by a candidate.
    fn candidate_applications(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError>;
    /// Unscoped lookup; the service applies the caller's tenancy rule.
    fn application(
        &self,
        application_id: &str,
    ) -> Result<Option<fsp_domain::ApplicationRecord>, RepositoryError>;
    fn save_application(
        &self,
        application: &fsp_domain::ApplicationRecord,
    ) -> Result<(), RepositoryError>;
    /// Tasks owned by a company.
    fn tasks(&self, company_id: &str) -> Result<Vec<fsp_domain::TaskRecord>, RepositoryError>;
    /// All active tasks across companies, for the weekly offer pool.
    fn active_tasks(&self) -> Result<Vec<fsp_domain::TaskRecord>, RepositoryError>;
    /// Unscoped lookup; the service applies the caller's tenancy rule.
    fn task(&self, task_id: &str) -> Result<Option<fsp_domain::TaskRecord>, RepositoryError>;
    fn save_task(&self, task: &fsp_domain::TaskRecord) -> Result<(), RepositoryError>;
    /// Responses sent by a candidate, for offers, history and freshness.
    fn candidate_task_responses(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::TaskResponseRecord>, RepositoryError>;
    /// Responses addressed to a company's tasks.
    fn company_task_responses(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::TaskResponseRecord>, RepositoryError>;
    /// Unscoped lookup; the service applies the caller's tenancy rule.
    fn task_response(
        &self,
        response_id: &str,
    ) -> Result<Option<fsp_domain::TaskResponseRecord>, RepositoryError>;
    fn save_task_response(
        &self,
        response: &fsp_domain::TaskResponseRecord,
    ) -> Result<(), RepositoryError>;
    /// Assessments owned by a candidate.
    fn candidate_assessments(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::AssessmentRecord>, RepositoryError>;
    /// Unscoped lookup; the service applies the caller's tenancy rule.
    fn assessment(
        &self,
        assessment_id: &str,
    ) -> Result<Option<fsp_domain::AssessmentRecord>, RepositoryError>;
    fn save_assessment(
        &self,
        assessment: &fsp_domain::AssessmentRecord,
    ) -> Result<(), RepositoryError>;
    fn save_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError>;
    fn consume_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        now: &str,
    ) -> Result<bool, RepositoryError>;
    fn save_github_token(&self, candidate_id: &str, token: &str) -> Result<(), RepositoryError>;
    fn github_token(&self, candidate_id: &str) -> Result<Option<String>, RepositoryError>;
    fn sources(&self, candidate_id: &str) -> Result<Vec<SourceRecord>, RepositoryError>;
    fn save_source(&self, source: &SourceRecord) -> Result<(), RepositoryError>;
    fn save_job(&self, job: &JobRecord) -> Result<(), RepositoryError>;
    fn job(&self, owner_id: &str, job_id: &str) -> Result<Option<JobRecord>, RepositoryError>;
    fn idempotency_get(
        &self,
        scope: &str,
    ) -> Result<Option<StoredIdempotentResponse>, RepositoryError>;
    fn idempotency_put(
        &self,
        scope: &str,
        fingerprint: &str,
        status: u16,
        body: &str,
        now: &str,
    ) -> Result<(), RepositoryError>;
    fn seed_demo(&self, now: &str) -> Result<(), RepositoryError>;
}

/// A stored `Idempotency-Key` response: the request fingerprint plus the
/// serialized success payload that a replayed request must receive verbatim.
#[derive(Debug, Clone)]
pub struct StoredIdempotentResponse {
    pub fingerprint: String,
    pub status: u16,
    pub body: String,
}

#[derive(Debug)]
pub struct IntegrationError {
    pub code: &'static str,
    pub message: String,
}

#[async_trait]
pub trait GitHubGateway: Send + Sync {
    fn authorization_url(
        &self,
        state: &str,
        redirect_uri: &str,
    ) -> Result<String, IntegrationError>;
    async fn exchange_code(&self, code: &str) -> Result<String, IntegrationError>;
    async fn analyze(
        &self,
        username: &str,
        token: &str,
    ) -> Result<GitHubAnalysis, IntegrationError>;
}

#[async_trait]
pub trait LlmGateway: Send + Sync {
    async fn extract_graph(
        &self,
        request: &GraphExtractionRequest,
    ) -> Result<ExtractedGraph, IntegrationError>;
    async fn match_repository(
        &self,
        request: &RepositoryMatchRequest,
    ) -> Result<RepositoryCompetitionMatch, IntegrationError>;
}

pub trait FspGateway: Send + Sync {
    fn participation(&self, account: &str) -> Result<FspParticipation, IntegrationError>;
}

pub trait VerificationDelivery: Send + Sync {
    fn code_for(&self) -> String;
    fn deliver(&self, email: &str, code: &str) -> Result<(), String>;
    fn contract_name(&self) -> &'static str;
}

#[derive(Debug, Clone)]
pub struct NewAccount {
    pub role: Role,
    pub email: String,
}
