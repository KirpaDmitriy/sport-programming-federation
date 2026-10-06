use fsp_domain::{
    Company, Criticality, EvidencePolicy, EvidenceSource, EvidenceStatus, Grade, JobRecord,
    MatchScore, RepositoryMetrics, Role, SourceProvider, SourceRecord, Specialization,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortlistInput {
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortlistsView {
    pub items: Vec<ShortlistSummaryView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortlistSummaryView {
    pub id: String,
    pub title: String,
    pub count: usize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortlistMemberView {
    pub candidate_id: String,
    pub alias: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortlistView {
    pub id: String,
    pub title: String,
    pub count: usize,
    pub created_at: String,
    pub updated_at: String,
    pub members: Vec<ShortlistMemberView>,
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

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum SalaryCurrency {
    #[serde(rename = "RUB")]
    Rub,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum SalaryPeriod {
    #[serde(rename = "month")]
    Month,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum SalaryTaxBasis {
    #[serde(rename = "gross")]
    Gross,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SalaryInput {
    pub from: u64,
    pub to: u64,
    pub currency: SalaryCurrency,
    pub period: SalaryPeriod,
    pub tax_basis: SalaryTaxBasis,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NeedInput {
    pub title: String,
    pub specialization: Specialization,
    pub grade: Grade,
    pub work_mode: String,
    pub salary: SalaryInput,
    pub description: String,
    pub requirements: Vec<fsp_domain::Requirement>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NeedPatch {
    pub title: Option<String>,
    pub specialization: Option<Specialization>,
    pub grade: Option<Grade>,
    pub work_mode: Option<String>,
    pub salary: Option<SalaryInput>,
    pub description: Option<String>,
    pub requirements: Option<Vec<fsp_domain::Requirement>>,
}

impl NeedPatch {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.specialization.is_none()
            && self.grade.is_none()
            && self.work_mode.is_none()
            && self.salary.is_none()
            && self.description.is_none()
            && self.requirements.is_none()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyCardView {
    pub id: String,
    pub display_name: String,
    pub business_area: String,
    pub description: String,
    pub contact_email: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancyRequirementView {
    pub skill_id: String,
    pub criticality: Criticality,
    pub minimum_grade: Grade,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationEligibilityView {
    pub can_apply: bool,
    pub reason: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancyView {
    pub id: String,
    pub company: CompanyCardView,
    pub title: String,
    pub specialization: Specialization,
    pub grade: Grade,
    pub work_mode: String,
    pub salary: SalaryView,
    pub description: String,
    pub requirements: Vec<VacancyRequirementView>,
    pub published_at: String,
    pub updated_at: String,
    pub r#match: Option<CandidateMatchView>,
    pub application_id: Option<String>,
    pub eligibility: ApplicationEligibilityView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancyPageView {
    pub items: Vec<VacancyView>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub has_next_page: bool,
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

#[derive(Debug, Clone, Default)]
pub struct VacancySearch {
    pub specialization: Option<Specialization>,
    pub grade: Option<Grade>,
    pub work_mode: Option<String>,
    pub skill: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceConnectInput {
    pub account: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcesView {
    pub items: Vec<SourceView>,
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    pub id: String,
    pub provider: SourceProvider,
    pub status: &'static str,
    pub synthetic: bool,
    pub active_job_id: Option<String>,
    pub account_label: Option<String>,
    pub last_synced_at: Option<String>,
    pub counts: SourceCountsView,
    pub repositories: Vec<RepositoryView>,
    pub active_days: Option<u32>,
    pub observation_period: Option<ObservationPeriodView>,
    pub verified_participation: bool,
    pub competition_ids: Vec<String>,
    pub notice: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCountsView {
    pub found: usize,
    pub processed: usize,
    pub queued: usize,
    pub unavailable: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryView {
    pub id: String,
    pub name: String,
    pub url: String,
    pub technologies: Vec<String>,
    pub status: &'static str,
    pub metrics: RepositoryMetrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationPeriodView {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    pub id: String,
    pub kind: &'static str,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub result: Option<JobResultView>,
    pub error: Option<JobErrorView>,
    pub poll_after_ms: u32,
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum JobResultView {
    SourceSync { source: SourceView },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobErrorView {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

pub fn source_view(record: SourceRecord) -> SourceView {
    let analysis = record.analysis;
    let repositories = analysis
        .as_ref()
        .map(|value| {
            value
                .repositories
                .iter()
                .map(|repository| RepositoryView {
                    id: repository.id.clone(),
                    name: repository.name.clone(),
                    url: repository.url.clone(),
                    technologies: repository.technologies.clone(),
                    status: "processed",
                    metrics: repository.metrics.clone(),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let observation_period = analysis.as_ref().and_then(|value| {
        Some(ObservationPeriodView {
            from: value.observed_from.clone()?,
            to: value.observed_to.clone()?,
        })
    });
    SourceView {
        id: record.id,
        provider: record.provider,
        status: if record.account_label.is_some() {
            "connected"
        } else {
            "not_connected"
        },
        synthetic: record.synthetic,
        active_job_id: record.active_job_id,
        account_label: record.account_label,
        last_synced_at: record.last_synced_at,
        counts: SourceCountsView {
            found: repositories.len(),
            processed: repositories.len(),
            queued: 0,
            unavailable: 0,
        },
        repositories,
        active_days: analysis.as_ref().map(|value| value.active_days),
        observation_period,
        verified_participation: record.verified_participation,
        competition_ids: record.competition_ids,
        notice: if record.synthetic {
            "Демонстрационные данные ФСП".into()
        } else if analysis.is_some() {
            "Метрики рассчитаны по данным GitHub".into()
        } else {
            String::new()
        },
    }
}

pub fn job_view(record: JobRecord, source: Option<SourceView>) -> JobView {
    // The mock asks clients to poll in-flight jobs every 250 ms and stops
    // polling once a job is terminal.
    let terminal = record.status == "succeeded" || record.status == "failed";
    JobView {
        id: record.id,
        kind: "source_sync",
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at,
        result: source.map(|source| JobResultView::SourceSync { source }),
        error: record.error_code.map(|code| JobErrorView {
            code,
            message: record.error_message.unwrap_or_default(),
            retryable: true,
        }),
        poll_after_ms: if terminal { 0 } else { 250 },
        simulation: true,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsView {
    pub items: Vec<SelfSkillView>,
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfSkillView {
    pub skill_id: String,
    pub label: String,
    pub status: EvidenceStatus,
    pub evidence_grade: Option<Grade>,
    pub evidence_sources: Vec<EvidenceSource>,
    pub summary: String,
    pub evidence_count: usize,
    pub confirmed_at: Option<String>,
    pub evidence: Vec<EvidenceView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceView {
    pub id: String,
    pub source: EvidenceSource,
    pub title: String,
    pub url: Option<String>,
    pub reference: Option<String>,
    pub observed_at: String,
    pub scope: &'static str,
    pub synthetic: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    pub audience: &'static str,
    pub nodes: Vec<GraphNodeView>,
    pub edges: Vec<GraphEdgeView>,
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodeView {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub skill_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeView {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relation: String,
}
