use fsp_domain::{
    Account, CandidateIndexRecord, CandidateProfile, Company, HiringNeedRecord, Role,
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
    fn needs(&self, company_id: &str) -> Result<Vec<HiringNeedRecord>, RepositoryError>;
    fn need(
        &self,
        company_id: &str,
        need_id: &str,
    ) -> Result<Option<HiringNeedRecord>, RepositoryError>;
    fn seed_demo(&self, now: &str) -> Result<(), RepositoryError>;
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
