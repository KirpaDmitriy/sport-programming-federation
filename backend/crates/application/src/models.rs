use fsp_domain::{
    Company, Criticality, EvidencePolicy, EvidenceSource, EvidenceStatus, Grade, MatchScore, Role,
    Specialization,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub actor_id: String,
    pub role: Role,
    pub email_verified: bool,
    pub candidate_id: Option<String>,
    pub company_id: Option<String>,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailChallengeInput {
    pub email: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailChallengeView {
    pub challenge_id: String,
    pub expires_at: String,
    pub delivery: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailVerifyInput {
    pub challenge_id: String,
    pub code: String,
}

#[derive(Debug, Clone)]
pub struct PendingChallenge {
    pub id: String,
    pub account_id: String,
    pub code_hash: String,
    pub expires_at: String,
    pub attempts: u8,
    pub used: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    pub id: String,
    pub alias: String,
    pub email: String,
    pub email_verified: bool,
    pub name: String,
    pub industry: &'static str,
    pub specialization: Specialization,
    pub selected_grade: Grade,
    pub stack: Vec<String>,
    pub team_role: String,
    pub experience_months: Option<u32>,
    pub experience: String,
    pub soft_skills: Vec<String>,
    pub consents: fsp_domain::Consents,
    pub verified_grade: Option<Grade>,
    pub verified_specialization: Option<Specialization>,
    pub grade_confirmed_at: Option<String>,
    pub category: CategoryView,
    pub freshness: FreshnessView,
    pub onboarding: OnboardingView,
    pub assessment_eligibility: GradeEligibilityView,
    pub revision: u64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryView {
    pub specialization: Option<Specialization>,
    pub grade: Option<Grade>,
    pub eligible: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreshnessView {
    pub last_signal_at: Option<String>,
    pub last_signal: Option<&'static str>,
    pub fresh: bool,
    pub window_days: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingView {
    pub email_verified: bool,
    pub questionnaire_complete: bool,
    pub assessment_passed: bool,
    pub ready_for_publication: bool,
    pub visible_to_employers: bool,
    pub blockers: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeEligibilityView {
    pub selected_specialization: Specialization,
    pub selected_grade: Grade,
    pub can_start_selected: bool,
    pub selected_reason: Option<&'static str>,
    pub can_start_upgrade: bool,
    pub next_eligible_at: Option<String>,
    pub cooldown_days: u16,
    pub reason: Option<&'static str>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfilePatch {
    pub name: Option<String>,
    pub industry: Option<String>,
    pub specialization: Option<Specialization>,
    pub selected_grade: Option<Grade>,
    pub stack: Option<Vec<String>>,
    pub team_role: Option<String>,
    pub experience_months: Option<Option<u32>>,
    pub experience: Option<String>,
    pub soft_skills: Option<Vec<String>>,
    pub consents: Option<fsp_domain::Consents>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyView {
    pub id: String,
    pub display_name: String,
    pub business_area: String,
    pub description: String,
    pub contact_email: String,
    pub website: Option<String>,
    pub ready_to_invite: bool,
}

impl From<Company> for CompanyView {
    fn from(company: Company) -> Self {
        let ready_to_invite = company.ready_to_invite();
        Self {
            id: company.id,
            display_name: company.display_name,
            business_area: company.business_area,
            description: company.description,
            contact_email: company.contact_email,
            website: company.website,
            ready_to_invite,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompanyPatch {
    pub display_name: Option<String>,
    pub business_area: Option<String>,
    pub description: Option<String>,
    pub contact_email: Option<String>,
    pub website: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeedsView {
    pub items: Vec<NeedView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeedView {
    pub id: String,
    pub company_id: String,
    pub title: String,
    pub specialization: Specialization,
    pub grade: Grade,
    pub work_mode: String,
    pub salary: SalaryView,
    pub description: String,
    pub requirements: Vec<RequirementView>,
    pub published: bool,
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalaryView {
    pub from: u64,
    pub to: u64,
    pub currency: &'static str,
    pub period: &'static str,
    pub tax_basis: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementView {
    pub skill_id: String,
    pub criticality: Criticality,
    pub minimum_grade: Grade,
    pub evidence_policy: EvidencePolicyView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePolicyView {
    pub accept_assessments: bool,
    pub accept_github: bool,
    pub accept_fsp: bool,
    pub competition_selection: String,
    pub competition_ids: Vec<String>,
}

impl From<&EvidencePolicy> for EvidencePolicyView {
    fn from(value: &EvidencePolicy) -> Self {
        Self {
            accept_assessments: value.accept_assessments,
            accept_github: value.accept_github,
            accept_fsp: value.accept_fsp,
            competition_selection: value.competition_selection.clone(),
            competition_ids: value.competition_ids.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidatePageView {
    pub items: Vec<AnonymousCandidateView>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymousCandidateView {
    pub id: String,
    pub alias: String,
    pub specialization: Specialization,
    pub verified_grade: Grade,
    pub grade_confirmed_at: String,
    pub work_modes: Vec<String>,
    pub available_for_offers: bool,
    pub skills: Vec<SkillView>,
    pub source_kinds: Vec<EvidenceSource>,
    pub fsp_verified: bool,
    pub freshness: FreshnessView,
    pub r#match: Option<CandidateMatchView>,
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillView {
    pub skill_id: String,
    pub label: String,
    pub status: EvidenceStatus,
    pub evidence_grade: Option<Grade>,
    pub evidence_sources: Vec<EvidenceSource>,
    pub summary: String,
    pub evidence_count: usize,
    pub confirmed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMatchView {
    pub need_id: String,
    pub status: &'static str,
    pub grade_matches: bool,
    pub required_met: usize,
    pub required_total: usize,
    pub desired_met: usize,
    pub desired_total: usize,
    pub requirements: Vec<MatchRequirementView>,
    pub explanation: String,
    pub algorithm_version: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRequirementView {
    pub skill_id: String,
    pub criticality: Criticality,
    pub status: &'static str,
    pub evidence_status: EvidenceStatus,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Default)]
pub struct CandidateSearch {
    pub need_id: Option<String>,
    pub recommended: bool,
    pub specialization: Option<Specialization>,
    pub grade: Option<Grade>,
    pub skill: Option<String>,
    pub fsp_verified: bool,
    pub page: usize,
    pub page_size: usize,
}

pub fn match_status(score: &MatchScore, requirements: &[MatchRequirementView]) -> &'static str {
    if requirements
        .iter()
        .any(|item| item.criticality == Criticality::Required && item.status == "not_evidenced")
    {
        "missing_required"
    } else if score.grade_matches && score.required_met == score.required_total {
        "meets_required"
    } else {
        "needs_verification"
    }
}
