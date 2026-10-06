use fsp_domain::{Company, Grade, Role, Specialization};
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
