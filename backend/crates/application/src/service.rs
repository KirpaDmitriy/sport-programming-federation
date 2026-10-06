use std::sync::Arc;

use chrono::{Duration, Utc};
use fsp_domain::{
    Account, CandidateIndexRecord, CandidateProfile, Company, Consents, EvidenceStatus, Grade,
    HiringNeedRecord, InteractionStatus, Requirement, Role, Specialization, rank_candidates, score,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    AcceptInvitationInput, AnonymousCandidateView, ApplicationEligibilityView, CandidateMatchView,
    CandidatePageView, CandidateSearch, CategoryView, CompanyCardView, CompanyPatch, CompanyView,
    ConsumeChallenge, DisclosureFieldsView, DisclosureView, EmailChallengeInput,
    EmailChallengeView, EmailVerifyInput, EvidencePolicyView, EvidenceView, FreshnessView,
    FspGateway, GitHubGateway, GradeEligibilityView, GraphEdgeView, GraphNodeView, GraphView,
    IntegrationError, InvitationInput, InvitationNeedView, InvitationView, InvitationsView,
    JobView, LlmGateway, MatchRequirementView, NeedInput, NeedPatch, NeedView, NeedsView,
    OnboardingView, PendingChallenge, PlatformRepository, ProfilePatch, ProfileView,
    RepositoryError, RequirementView, SalaryView, SelfSkillView, SessionView, ShortlistInput,
    ShortlistMemberView, ShortlistSummaryView, ShortlistView, ShortlistsView, SkillView,
    SkillsView, SourceConnectInput, SourceView, SourcesView, VacancyPageView,
    VacancyRequirementView, VacancySearch, VacancyView, VerificationDelivery, job_view,
    match_status, source_view,
};

#[derive(Debug)]
pub struct ApplicationError {
    pub status: u16,
    pub code: &'static str,
    pub message: String,
}

impl ApplicationError {
    fn new(status: u16, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn storage(error: RepositoryError) -> Self {
        tracing::error!(error = ?error, "storage operation failed");
        Self::new(500, "internal_error", "Сервис временно недоступен")
    }
}

/// Outcome of an `Idempotency-Key` scoped command: either the stored response
/// is replayed verbatim or the fresh operation result is returned.
pub enum Idempotent<T> {
    Replayed { status: u16, body: String },
    Fresh(T),
}

/// The request context that scopes an idempotent command: operation name, the
/// concrete path, the client key, the parsed body and the success status the
/// replayed response must keep.
pub struct IdempotencyContext<'a> {
    pub operation: &'static str,
    pub path: &'a str,
    pub key: &'a str,
    pub body: &'a serde_json::Value,
    pub status: u16,
}

pub struct PlatformService {
    repository: Arc<dyn PlatformRepository>,
    delivery: Arc<dyn VerificationDelivery>,
    github: Option<Arc<dyn GitHubGateway>>,
    llm: Option<Arc<dyn LlmGateway>>,
    fsp: Option<Arc<dyn FspGateway>>,
}

impl PlatformService {
    pub fn new(
        repository: Arc<dyn PlatformRepository>,
        delivery: Arc<dyn VerificationDelivery>,
    ) -> Self {
        Self {
            repository,
            delivery,
            github: None,
            llm: None,
            fsp: None,
        }
    }

    #[must_use]
    pub fn with_github(mut self, github: Arc<dyn GitHubGateway>) -> Self {
        self.github = Some(github);
        self
    }

    #[must_use]
    pub fn with_llm(mut self, llm: Arc<dyn LlmGateway>) -> Self {
        self.llm = Some(llm);
        self
    }

    #[must_use]
    pub fn with_fsp(mut self, fsp: Arc<dyn FspGateway>) -> Self {
        self.fsp = Some(fsp);
        self
    }

    pub fn initialize(&self) -> Result<(), ApplicationError> {
        self.repository
            .seed_demo(&now())
            .map_err(ApplicationError::storage)
    }

    #[must_use]
    pub fn github_configured(&self) -> bool {
        self.github.is_some()
    }

    #[must_use]
    pub fn llm_configured(&self) -> bool {
        self.llm.is_some()
    }

    pub fn request_challenge(
        &self,
        input: EmailChallengeInput,
    ) -> Result<EmailChallengeView, ApplicationError> {
        let email = input.email.trim().to_lowercase();
        if !email.contains('@') || email.len() > 254 {
            return Err(ApplicationError::new(
                400,
                "validation_error",
                "Проверьте адрес электронной почты",
            ));
        }
        let account = match self
            .repository
            .account_by_email(&email)
            .map_err(ApplicationError::storage)?
        {
            Some(account) if account.role != input.role => {
                return Err(ApplicationError::new(
                    409,
                    "role_mismatch",
                    "Этот адрес зарегистрирован с другой ролью",
                ));
            }
            Some(account) => account,
            None => self.register_account(email.clone(), input.role)?,
        };
        let code = self.delivery.code_for();
        let issued_at = Utc::now();
        let expires_at = issued_at + Duration::minutes(15);
        let challenge = PendingChallenge {
            id: format!("challenge-{}", Uuid::new_v4().simple()),
            account_id: account.id,
            code_hash: digest(&code),
            expires_at: expires_at.to_rfc3339(),
            attempts: 0,
            used: false,
        };
        self.repository
            .save_challenge(&challenge)
            .map_err(ApplicationError::storage)?;
        self.delivery.deliver(&email, &code).map_err(|message| {
            ApplicationError::new(502, "verification_delivery_failed", message)
        })?;
        Ok(EmailChallengeView {
            challenge_id: challenge.id,
            expires_at: challenge.expires_at,
            delivery: self.delivery.contract_name(),
        })
    }

    pub fn verify_email(
        &self,
        input: EmailVerifyInput,
    ) -> Result<(SessionView, String), ApplicationError> {
        if input.code.len() != 6 || !input.code.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(ApplicationError::new(400, "invalid_code", "Неверный код"));
        }
        let (outcome, account) = self
            .repository
            .consume_challenge(&input.challenge_id, &digest(&input.code), &now())
            .map_err(ApplicationError::storage)?;
        match outcome {
            ConsumeChallenge::Consumed => {}
            ConsumeChallenge::Missing => {
                return Err(ApplicationError::new(
                    404,
                    "not_found",
                    "Запрос подтверждения не найден",
                ));
            }
            ConsumeChallenge::Used => {
                return Err(ApplicationError::new(
                    409,
                    "challenge_used",
                    "Код уже использован",
                ));
            }
            ConsumeChallenge::Expired => {
                return Err(ApplicationError::new(
                    400,
                    "challenge_expired",
                    "Срок действия кода истёк",
                ));
            }
            ConsumeChallenge::Locked => {
                return Err(ApplicationError::new(
                    429,
                    "challenge_locked",
                    "Создайте новый запрос подтверждения",
                ));
            }
            ConsumeChallenge::WrongCode => {
                return Err(ApplicationError::new(400, "invalid_code", "Неверный код"));
            }
        }
        let account = account.ok_or_else(|| {
            ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
        })?;
        let raw_token = Uuid::new_v4().to_string();
        self.repository
            .create_session(
                &digest(&raw_token),
                &account.id,
                &(Utc::now() + Duration::days(30)).to_rfc3339(),
            )
            .map_err(ApplicationError::storage)?;
        Ok((self.session_view(&account)?, raw_token))
    }

    pub fn session(&self, raw_token: &str) -> Result<SessionView, ApplicationError> {
        let account = self
            .repository
            .account_for_session(&digest(raw_token), &now())
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(401, "unauthenticated", "Войдите в аккаунт"))?;
        self.session_view(&account)
    }

    pub fn logout(&self, raw_token: &str) -> Result<(), ApplicationError> {
        self.repository
            .delete_session(&digest(raw_token))
            .map_err(ApplicationError::storage)
    }

    pub fn profile(&self, session: &SessionView) -> Result<ProfileView, ApplicationError> {
        let id = session.candidate_id.as_deref().ok_or_else(|| {
            ApplicationError::new(403, "role_forbidden", "Действие доступно кандидату")
        })?;
        let profile = self
            .repository
            .candidate(id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Профиль не найден"))?;
        Ok(profile_view(profile, session.email_verified))
    }

    pub fn update_profile(
        &self,
        session: &SessionView,
        patch: ProfilePatch,
    ) -> Result<ProfileView, ApplicationError> {
        validate_profile_patch(&patch)?;
        let id = session.candidate_id.as_deref().ok_or_else(|| {
            ApplicationError::new(403, "role_forbidden", "Действие доступно кандидату")
        })?;
        let mut profile = self
            .repository
            .candidate(id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Профиль не найден"))?;
        if let Some(name) = patch.name {
            profile.name = name.trim().to_owned();
        }
        if let Some(value) = patch.specialization {
            profile.specialization = value;
        }
        if let Some(value) = patch.selected_grade {
            profile.selected_grade = value;
        }
        if let Some(value) = patch.stack {
            profile.stack = unique(value);
        }
        if let Some(value) = patch.team_role {
            profile.team_role = value.trim().to_owned();
        }
        if let Some(value) = patch.experience_months {
            profile.experience_months = value;
        }
        if let Some(value) = patch.experience {
            profile.experience = value;
        }
        if let Some(value) = patch.soft_skills {
            profile.soft_skills = unique(value);
        }
        if let Some(value) = patch.consents {
            profile.consents = value;
        }
        if profile.consents.publication && !profile.consents.processing {
            return Err(ApplicationError::new(
                403,
                "processing_consent_required",
                "Для обработки данных необходимо согласие",
            ));
        }
        profile.revision += 1;
        profile.updated_at = now();
        self.repository
            .save_candidate(&profile)
            .map_err(ApplicationError::storage)?;
        Ok(profile_view(profile, session.email_verified))
    }

    pub fn company(&self, session: &SessionView) -> Result<CompanyView, ApplicationError> {
        let id = session.company_id.as_deref().ok_or_else(|| {
            ApplicationError::new(403, "role_forbidden", "Действие доступно работодателю")
        })?;
        self.repository
            .company(id)
            .map_err(ApplicationError::storage)?
            .map(CompanyView::from)
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Компания не найдена"))
    }

    pub fn update_company(
        &self,
        session: &SessionView,
        patch: CompanyPatch,
    ) -> Result<CompanyView, ApplicationError> {
        validate_company_patch(&patch)?;
        let id = session.company_id.as_deref().ok_or_else(|| {
            ApplicationError::new(403, "role_forbidden", "Действие доступно работодателю")
        })?;
        let mut company = self
            .repository
            .company(id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Компания не найдена"))?;
        if let Some(value) = patch.display_name {
            company.display_name = value.trim().to_owned();
        }
        if let Some(value) = patch.business_area {
            company.business_area = value.trim().to_owned();
        }
        if let Some(value) = patch.description {
            company.description = value.trim().to_owned();
        }
        if let Some(value) = patch.contact_email {
            company.contact_email = value.trim().to_lowercase();
        }
        if let Some(value) = patch.website {
            company.website = value;
        }
        self.repository
            .save_company(&company)
            .map_err(ApplicationError::storage)?;
        Ok(company.into())
    }

    pub fn needs(&self, session: &SessionView) -> Result<NeedsView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        let items = self
            .repository
            .needs(company_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .map(need_view)
            .collect();
        Ok(NeedsView { items })
    }

    /// The mock's `needFor`: employer needs are scoped to the caller's company,
    /// an out-of-scope id is indistinguishable from missing.
    fn own_need(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<HiringNeedRecord, ApplicationError> {
        let company_id = employer_company_id(session)?;
        self.repository
            .need(company_id, need_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Ресурс не найден"))
    }

    pub fn create_need(
        &self,
        session: &SessionView,
        input: NeedInput,
    ) -> Result<NeedView, ApplicationError> {
        let company_id = employer_company_id(session)?.to_owned();
        validate_need_schema(
            &input.title,
            &input.work_mode,
            &input.description,
            &input.requirements,
        )?;
        validate_need_rules(input.salary.from, input.salary.to, &input.requirements)?;
        let timestamp = now();
        let record = HiringNeedRecord {
            id: format!("need-{}", Uuid::new_v4().simple()),
            company_id,
            title: input.title,
            need: fsp_domain::HiringNeed {
                specialization: input.specialization,
                grade: input.grade,
                requirements: input.requirements,
            },
            work_mode: input.work_mode,
            salary_from: input.salary.from,
            salary_to: input.salary.to,
            description: input.description,
            published: false,
            published_at: None,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            revision: 1,
        };
        self.repository
            .save_need(&record)
            .map_err(ApplicationError::storage)?;
        Ok(need_view(record))
    }

    pub fn get_need(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<NeedView, ApplicationError> {
        self.own_need(session, need_id).map(need_view)
    }

    pub fn update_need(
        &self,
        session: &SessionView,
        need_id: &str,
        patch: NeedPatch,
    ) -> Result<NeedView, ApplicationError> {
        let mut record = self.own_need(session, need_id)?;
        if patch.is_empty() {
            return Err(validation("Запрос не соответствует контракту"));
        }
        if let Some(title) = &patch.title
            && !(1..=160).contains(&title.chars().count())
        {
            return Err(validation("Запрос не соответствует контракту"));
        }
        if let Some(description) = &patch.description
            && description.chars().count() > 6000
        {
            return Err(validation("Запрос не соответствует контракту"));
        }
        if let Some(work_mode) = &patch.work_mode
            && !WORK_MODES.contains(&work_mode.as_str())
        {
            return Err(validation("Запрос не соответствует контракту"));
        }
        if let Some(salary) = &patch.salary
            && (salary.from == 0
                || salary.to == 0
                || salary.from > 100_000_000
                || salary.to > 100_000_000)
        {
            return Err(validation("Запрос не соответствует контракту"));
        }
        if let Some(requirements) = &patch.requirements {
            validate_requirements_schema(requirements)?;
        }
        let (salary_from, salary_to) = patch
            .salary
            .map(|salary| (salary.from, salary.to))
            .unwrap_or((record.salary_from, record.salary_to));
        let requirements = patch.requirements.unwrap_or(record.need.requirements);
        validate_need_rules(salary_from, salary_to, &requirements)?;
        if let Some(title) = patch.title {
            record.title = title;
        }
        if let Some(specialization) = patch.specialization {
            record.need.specialization = specialization;
        }
        if let Some(grade) = patch.grade {
            record.need.grade = grade;
        }
        if let Some(work_mode) = patch.work_mode {
            record.work_mode = work_mode;
        }
        if let Some(description) = patch.description {
            record.description = description;
        }
        record.salary_from = salary_from;
        record.salary_to = salary_to;
        record.need.requirements = requirements;
        record.revision += 1;
        record.updated_at = now();
        self.repository
            .save_need(&record)
            .map_err(ApplicationError::storage)?;
        Ok(need_view(record))
    }

    pub fn delete_need(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<(), ApplicationError> {
        let record = self.own_need(session, need_id)?;
        self.repository
            .delete_need(&record.company_id, &record.id)
            .map_err(ApplicationError::storage)
    }

    pub fn publish_need(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<NeedView, ApplicationError> {
        let mut record = self.own_need(session, need_id)?;
        if record.published {
            return Ok(need_view(record));
        }
        let company = self
            .repository
            .company(&record.company_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| {
                ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
            })?;
        if !company.ready_to_invite() {
            return Err(ApplicationError::new(
                422,
                "company_incomplete",
                "Заполните описание компании со сферой деятельности и контактную почту",
            ));
        }
        if !session.email_verified {
            return Err(ApplicationError::new(
                403,
                "email_not_verified",
                "Подтвердите почту работодателя",
            ));
        }
        validate_need_rules(
            record.salary_from,
            record.salary_to,
            &record.need.requirements,
        )?;
        record.published = true;
        record.published_at = Some(now());
        self.repository
            .save_need(&record)
            .map_err(ApplicationError::storage)?;
        Ok(need_view(record))
    }

    pub fn unpublish_need(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<NeedView, ApplicationError> {
        let mut record = self.own_need(session, need_id)?;
        record.published = false;
        record.published_at = None;
        self.repository
            .save_need(&record)
            .map_err(ApplicationError::storage)?;
        Ok(need_view(record))
    }

    pub fn need_graph(
        &self,
        session: &SessionView,
        need_id: &str,
    ) -> Result<GraphView, ApplicationError> {
        let record = self.own_need(session, need_id)?;
        let mut nodes = vec![GraphNodeView {
            id: "need-root".into(),
            kind: "role".into(),
            label: record.title,
            skill_id: None,
            status: None,
        }];
        let mut edges = Vec::new();
        for requirement in &record.need.requirements {
            let id = format!("skill-{}", requirement.skill_id);
            nodes.push(GraphNodeView {
                id: id.clone(),
                kind: "skill".into(),
                label: skill_label(&requirement.skill_id).into(),
                skill_id: Some(requirement.skill_id.clone()),
                status: None,
            });
            edges.push(GraphEdgeView {
                id: format!("requires-{}", requirement.skill_id),
                from: "need-root".into(),
                to: id,
                relation: "requires".into(),
            });
        }
        Ok(GraphView {
            audience: "employer",
            nodes,
            edges,
            simulation: true,
        })
    }

    /// The mock's `applicationEligibility`: onboarding gates first, an existing
    /// active application last.
    fn application_eligibility(
        &self,
        record: &CandidateIndexRecord,
        need_id: &str,
    ) -> Result<ApplicationEligibilityView, ApplicationError> {
        let profile = &record.profile;
        let assessment_passed =
            profile.verified_grade.is_some() && profile.verified_specialization.is_some();
        let reason = if !record.email_verified {
            Some("email")
        } else if !profile.questionnaire_complete() {
            Some("questionnaire")
        } else if !assessment_passed {
            Some("assessment")
        } else if !profile.consents.processing {
            Some("processing_consent")
        } else if self.active_application(&profile.id, need_id)?.is_some() {
            Some("application_exists")
        } else {
            None
        };
        Ok(ApplicationEligibilityView {
            can_apply: reason.is_none(),
            reason,
        })
    }

    /// The latest non-withdrawn application of this candidate to the vacancy,
    /// if applications exist (wired in the applications vertical).
    fn active_application(
        &self,
        _candidate_id: &str,
        _need_id: &str,
    ) -> Result<Option<String>, ApplicationError> {
        Ok(None)
    }

    fn vacancy_view(
        &self,
        need: HiringNeedRecord,
        candidate: &CandidateIndexRecord,
    ) -> Result<VacancyView, ApplicationError> {
        let company = self
            .repository
            .company(&need.company_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| {
                ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
            })?;
        let assessment_passed = candidate.profile.verified_grade.is_some()
            && candidate.profile.verified_specialization.is_some();
        let qualified = assessment_passed && candidate.profile.consents.processing;
        let company_card = CompanyCardView {
            id: company.id,
            display_name: company.display_name,
            business_area: company.business_area,
            description: company.description,
            contact_email: company.contact_email,
        };
        let eligibility = self.application_eligibility(candidate, &need.id)?;
        let application_id = self.active_application(&candidate.profile.id, &need.id)?;
        let r#match = candidate
            .rankable()
            .filter(|_| qualified)
            .map(|rankable| match_view(&rankable, &need));
        Ok(VacancyView {
            id: need.id.clone(),
            company: company_card,
            title: need.title,
            specialization: need.need.specialization,
            grade: need.need.grade,
            work_mode: need.work_mode,
            salary: SalaryView {
                from: need.salary_from,
                to: need.salary_to,
                currency: "RUB",
                period: "month",
                tax_basis: "gross",
            },
            description: need.description,
            requirements: need
                .need
                .requirements
                .into_iter()
                .map(|item| VacancyRequirementView {
                    skill_id: item.skill_id,
                    criticality: item.criticality,
                    minimum_grade: item.minimum_grade,
                })
                .collect(),
            published_at: need.published_at.unwrap_or_default(),
            updated_at: need.updated_at,
            r#match,
            application_id,
            eligibility,
        })
    }

    pub fn search_vacancies(
        &self,
        session: &SessionView,
        search: &VacancySearch,
    ) -> Result<VacancyPageView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let candidate = self.candidate_index(candidate_id)?;
        let mut needs = self
            .repository
            .published_needs()
            .map_err(ApplicationError::storage)?;
        // The mock sorts newest publication first and breaks ties by id.
        needs.sort_by(|left, right| {
            right
                .published_at
                .cmp(&left.published_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        let filtered = needs
            .into_iter()
            .filter(|need| {
                search
                    .specialization
                    .is_none_or(|value| need.need.specialization == value)
                    && search.grade.is_none_or(|value| need.need.grade == value)
                    && search
                        .work_mode
                        .as_deref()
                        .is_none_or(|value| need.work_mode == value)
                    && search.skill.as_deref().is_none_or(|skill| {
                        need.need
                            .requirements
                            .iter()
                            .any(|item| item.skill_id == skill)
                    })
            })
            .collect::<Vec<_>>();
        let total = filtered.len();
        let items = filtered
            .into_iter()
            .skip((search.page - 1).saturating_mul(search.page_size))
            .take(search.page_size)
            .map(|need| self.vacancy_view(need, &candidate))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(VacancyPageView {
            items,
            page: search.page,
            page_size: search.page_size,
            total,
            has_next_page: search.page * search.page_size < total,
        })
    }

    pub fn get_vacancy(
        &self,
        session: &SessionView,
        vacancy_id: &str,
    ) -> Result<VacancyView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let candidate = self.candidate_index(candidate_id)?;
        let need = self
            .repository
            .published_needs()
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|need| need.id == vacancy_id)
            .ok_or_else(|| {
                ApplicationError::new(
                    404,
                    "not_found",
                    "Вакансия не найдена или снята с публикации",
                )
            })?;
        self.vacancy_view(need, &candidate)
    }

    /// The mock's `shortlistFor`: shortlists are scoped to the caller's
    /// company, an out-of-scope id is indistinguishable from missing.
    fn own_shortlist(
        &self,
        session: &SessionView,
        shortlist_id: &str,
    ) -> Result<fsp_domain::ShortlistRecord, ApplicationError> {
        let company_id = employer_company_id(session)?;
        self.repository
            .shortlist(company_id, shortlist_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Ресурс не найден"))
    }

    /// Candidate visibility for shortlist membership: alias falls back to the
    /// mock's placeholder and `available` reflects the public-bank rules.
    fn shortlist_members(
        &self,
        record: &fsp_domain::ShortlistRecord,
    ) -> Result<Vec<ShortlistMemberView>, ApplicationError> {
        let candidates = self
            .repository
            .candidates()
            .map_err(ApplicationError::storage)?;
        Ok(record
            .member_ids
            .iter()
            .map(|member_id| {
                let candidate = candidates.iter().find(|item| item.profile.id == *member_id);
                ShortlistMemberView {
                    candidate_id: member_id.clone(),
                    alias: candidate
                        .map(|item| item.profile.alias.clone())
                        .unwrap_or_else(|| "Недоступный профиль".to_owned()),
                    available: candidate
                        .is_some_and(|item| item.profile.visible_to_employers(item.email_verified)),
                }
            })
            .collect())
    }

    fn shortlist_detail(
        &self,
        record: fsp_domain::ShortlistRecord,
    ) -> Result<ShortlistView, ApplicationError> {
        let members = self.shortlist_members(&record)?;
        Ok(ShortlistView {
            id: record.id,
            title: record.title,
            count: members.len(),
            created_at: record.created_at,
            updated_at: record.updated_at,
            members,
        })
    }

    fn validate_shortlist_title(title: &str) -> Result<(), ApplicationError> {
        if (1..=120).contains(&title.chars().count()) {
            Ok(())
        } else {
            Err(validation("Запрос не соответствует контракту"))
        }
    }

    pub fn shortlists(&self, session: &SessionView) -> Result<ShortlistsView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        let items = self
            .repository
            .shortlists(company_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .map(|record| ShortlistSummaryView {
                id: record.id,
                title: record.title,
                count: record.member_ids.len(),
                created_at: record.created_at,
                updated_at: record.updated_at,
            })
            .collect();
        Ok(ShortlistsView { items })
    }

    pub fn create_shortlist(
        &self,
        session: &SessionView,
        input: ShortlistInput,
    ) -> Result<ShortlistView, ApplicationError> {
        Self::validate_shortlist_title(&input.title)?;
        let company_id = employer_company_id(session)?.to_owned();
        let timestamp = now();
        let record = fsp_domain::ShortlistRecord {
            id: format!("shortlist-{}", Uuid::new_v4().simple()),
            company_id,
            title: input.title,
            member_ids: Vec::new(),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        self.repository
            .save_shortlist(&record)
            .map_err(ApplicationError::storage)?;
        self.shortlist_detail(record)
    }

    pub fn get_shortlist(
        &self,
        session: &SessionView,
        shortlist_id: &str,
    ) -> Result<ShortlistView, ApplicationError> {
        let record = self.own_shortlist(session, shortlist_id)?;
        self.shortlist_detail(record)
    }

    pub fn update_shortlist(
        &self,
        session: &SessionView,
        shortlist_id: &str,
        input: ShortlistInput,
    ) -> Result<ShortlistView, ApplicationError> {
        Self::validate_shortlist_title(&input.title)?;
        let mut record = self.own_shortlist(session, shortlist_id)?;
        record.title = input.title;
        record.updated_at = now();
        self.repository
            .save_shortlist(&record)
            .map_err(ApplicationError::storage)?;
        self.shortlist_detail(record)
    }

    pub fn delete_shortlist(
        &self,
        session: &SessionView,
        shortlist_id: &str,
    ) -> Result<(), ApplicationError> {
        let record = self.own_shortlist(session, shortlist_id)?;
        self.repository
            .delete_shortlist(&record.company_id, &record.id)
            .map_err(ApplicationError::storage)
    }

    pub fn add_shortlist_member(
        &self,
        session: &SessionView,
        shortlist_id: &str,
        candidate_id: &str,
    ) -> Result<ShortlistView, ApplicationError> {
        let mut record = self.own_shortlist(session, shortlist_id)?;
        // The mock's `visibleCandidate`: only candidates visible to employers
        // can be shortlisted.
        let visible = self
            .repository
            .candidates()
            .map_err(ApplicationError::storage)?
            .into_iter()
            .any(|item| {
                item.profile.id == candidate_id
                    && item.profile.visible_to_employers(item.email_verified)
            });
        if !visible {
            return Err(ApplicationError::new(404, "not_found", "Ресурс не найден"));
        }
        if !record.member_ids.iter().any(|id| id == candidate_id) {
            record.member_ids.push(candidate_id.to_owned());
        }
        record.updated_at = now();
        self.repository
            .save_shortlist(&record)
            .map_err(ApplicationError::storage)?;
        self.shortlist_detail(record)
    }

    pub fn remove_shortlist_member(
        &self,
        session: &SessionView,
        shortlist_id: &str,
        candidate_id: &str,
    ) -> Result<ShortlistView, ApplicationError> {
        let mut record = self.own_shortlist(session, shortlist_id)?;
        record.member_ids.retain(|id| id != candidate_id);
        record.updated_at = now();
        self.repository
            .save_shortlist(&record)
            .map_err(ApplicationError::storage)?;
        self.shortlist_detail(record)
    }

    /// The mock's `invitationFor`: candidates reach their own invitations,
    /// employers reach their company's, everything else is missing.
    fn invitation_for(
        &self,
        session: &SessionView,
        invitation_id: &str,
    ) -> Result<fsp_domain::InvitationRecord, ApplicationError> {
        let record = self
            .repository
            .invitation(invitation_id)
            .map_err(ApplicationError::storage)?;
        match record {
            Some(item)
                if match session.role {
                    Role::Candidate => {
                        session.candidate_id.as_deref() == Some(item.candidate_id.as_str())
                    }
                    Role::Employer => {
                        session.company_id.as_deref() == Some(item.company_id.as_str())
                    }
                } =>
            {
                Ok(item)
            }
            _ => Err(ApplicationError::new(404, "not_found", "Ресурс не найден")),
        }
    }

    /// The mock's `visibleCandidate`: a candidate reachable by employers.
    fn visible_candidate(
        &self,
        candidate_id: &str,
    ) -> Result<CandidateIndexRecord, ApplicationError> {
        self.repository
            .candidates()
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|item| {
                item.profile.id == candidate_id
                    && item.profile.visible_to_employers(item.email_verified)
            })
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Ресурс не найден"))
    }

    fn employer_company(&self, session: &SessionView) -> Result<Company, ApplicationError> {
        let company_id = employer_company_id(session)?;
        self.repository
            .company(company_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Ресурс не найден"))
    }

    /// The shared publication preconditions: a complete company card and a
    /// verified employer e-mail, in the mock's check order.
    fn require_invitable_employer(
        &self,
        session: &SessionView,
    ) -> Result<Company, ApplicationError> {
        let company = self.employer_company(session)?;
        if !company.ready_to_invite() {
            return Err(ApplicationError::new(
                422,
                "company_incomplete",
                "Заполните описание компании со сферой деятельности и контактную почту",
            ));
        }
        if !session.email_verified {
            return Err(ApplicationError::new(
                403,
                "email_not_verified",
                "Подтвердите почту работодателя",
            ));
        }
        Ok(company)
    }

    pub fn invitations(&self, session: &SessionView) -> Result<InvitationsView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        let items = self
            .repository
            .invitations(company_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .map(invitation_view)
            .collect();
        Ok(InvitationsView { items })
    }

    /// The mock's `createInvitation`, run inside `idempotent` by the caller.
    pub fn create_invitation(
        &self,
        session: &SessionView,
        input: InvitationInput,
    ) -> Result<InvitationView, ApplicationError> {
        if !(1..=4000).contains(&input.message.chars().count()) {
            return Err(validation("Запрос не соответствует контракту"));
        }
        let company = self.require_invitable_employer(session)?;
        let need = self.own_need(session, &input.need_id)?;
        validate_need_rules(need.salary_from, need.salary_to, &need.need.requirements)?;
        let candidate = self.visible_candidate(&input.candidate_id)?;
        let duplicate = self
            .repository
            .invitations(&company.id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .any(|item| {
                item.candidate_id == candidate.profile.id
                    && item.need.id == need.id
                    && matches!(
                        item.status,
                        InteractionStatus::Sent
                            | InteractionStatus::Viewed
                            | InteractionStatus::Accepted
                    )
            });
        if duplicate {
            return Err(ApplicationError::new(
                409,
                "invitation_exists",
                "Приглашение по этой потребности уже существует",
            ));
        }
        let timestamp = now();
        let record = fsp_domain::InvitationRecord {
            id: format!("invitation-{}", Uuid::new_v4().simple()),
            company_id: company.id.clone(),
            candidate_id: candidate.profile.id.clone(),
            candidate_alias: candidate.profile.alias.clone(),
            company: fsp_domain::CompanyCard {
                id: company.id,
                display_name: company.display_name,
                business_area: company.business_area,
                description: company.description,
                contact_email: company.contact_email,
            },
            need: fsp_domain::NeedSnapshot {
                id: need.id.clone(),
                title: need.title.clone(),
                work_mode: need.work_mode.clone(),
                salary_from: need.salary_from,
                salary_to: need.salary_to,
                description: need.description.clone(),
            },
            need_definition: need,
            message: input.message,
            status: InteractionStatus::Sent,
            created_at: timestamp,
            viewed_at: None,
            responded_at: None,
            disclosure_fields: Vec::new(),
        };
        self.repository
            .save_invitation(&record)
            .map_err(ApplicationError::storage)?;
        Ok(invitation_view(record))
    }

    pub fn get_invitation(
        &self,
        session: &SessionView,
        invitation_id: &str,
    ) -> Result<InvitationView, ApplicationError> {
        self.invitation_for(session, invitation_id)
            .map(invitation_view)
    }

    pub fn withdraw_invitation(
        &self,
        session: &SessionView,
        invitation_id: &str,
    ) -> Result<InvitationView, ApplicationError> {
        let mut record = self.invitation_for(session, invitation_id)?;
        if record.status == InteractionStatus::Withdrawn {
            return Ok(invitation_view(record));
        }
        if record.status.terminal() {
            return Err(ApplicationError::new(
                409,
                "invitation_terminal",
                "Решение по приглашению уже принято",
            ));
        }
        record.status = InteractionStatus::Withdrawn;
        record.responded_at = Some(now());
        self.repository
            .save_invitation(&record)
            .map_err(ApplicationError::storage)?;
        Ok(invitation_view(record))
    }

    pub fn my_invitations(
        &self,
        session: &SessionView,
    ) -> Result<InvitationsView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let items = self
            .repository
            .candidate_invitations(candidate_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .map(invitation_view)
            .collect();
        Ok(InvitationsView { items })
    }

    pub fn view_my_invitation(
        &self,
        session: &SessionView,
        invitation_id: &str,
    ) -> Result<InvitationView, ApplicationError> {
        let mut record = self.invitation_for(session, invitation_id)?;
        if record.status == InteractionStatus::Sent {
            record.status = InteractionStatus::Viewed;
            record.viewed_at = Some(now());
            self.repository
                .save_invitation(&record)
                .map_err(ApplicationError::storage)?;
        }
        Ok(invitation_view(record))
    }

    pub fn accept_my_invitation(
        &self,
        session: &SessionView,
        invitation_id: &str,
        input: AcceptInvitationInput,
    ) -> Result<InvitationView, ApplicationError> {
        let mut disclose = input.disclose;
        validate_disclose(&disclose)?;
        disclose.sort();
        let mut record = self.invitation_for(session, invitation_id)?;
        if record.status == InteractionStatus::Accepted && record.disclosure_fields == disclose {
            return Ok(invitation_view(record));
        }
        if record.status.terminal() {
            return Err(ApplicationError::new(
                409,
                "invitation_terminal",
                "Решение по приглашению уже принято",
            ));
        }
        let candidate = self.candidate_index(candidate_id(session)?)?;
        if !candidate.email_verified {
            return Err(ApplicationError::new(
                403,
                "email_not_verified",
                "Подтвердите почту",
            ));
        }
        record.status = InteractionStatus::Accepted;
        record.responded_at = Some(now());
        record.disclosure_fields = disclose;
        self.repository
            .save_invitation(&record)
            .map_err(ApplicationError::storage)?;
        self.refresh_disclosure(&record.company_id.clone(), &candidate)?;
        Ok(invitation_view(record))
    }

    pub fn decline_my_invitation(
        &self,
        session: &SessionView,
        invitation_id: &str,
    ) -> Result<InvitationView, ApplicationError> {
        let mut record = self.invitation_for(session, invitation_id)?;
        if record.status == InteractionStatus::Declined {
            return Ok(invitation_view(record));
        }
        if record.status.terminal() {
            return Err(ApplicationError::new(
                409,
                "invitation_terminal",
                "Решение по приглашению уже принято",
            ));
        }
        record.status = InteractionStatus::Declined;
        record.responded_at = Some(now());
        self.repository
            .save_invitation(&record)
            .map_err(ApplicationError::storage)?;
        Ok(invitation_view(record))
    }

    /// The mock's `refreshDisclosure`: recomputes a company's disclosure grant
    /// from accepted invitations (and, once applications land, active
    /// applications). Removing the last grant deletes the record.
    fn refresh_disclosure(
        &self,
        company_id: &str,
        candidate: &CandidateIndexRecord,
    ) -> Result<(), ApplicationError> {
        let invitations = self
            .repository
            .invitations(company_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .filter(|item| {
                item.candidate_id == candidate.profile.id
                    && item.status == InteractionStatus::Accepted
            })
            .collect::<Vec<_>>();
        let granted = invitations
            .iter()
            .flat_map(|item| item.disclosure_fields.iter().cloned())
            .collect::<std::collections::BTreeSet<_>>();
        // Applications extend the grant; they join this union in W2.5.
        if granted.is_empty() {
            return self
                .repository
                .delete_disclosure(company_id, &candidate.profile.id)
                .map_err(ApplicationError::storage);
        }
        let invitation = invitations.iter().max_by(|a, b| {
            (a.responded_at.as_deref().unwrap_or(&a.created_at))
                .cmp(b.responded_at.as_deref().unwrap_or(&b.created_at))
        });
        let source_links = if granted.contains("sourceLinks") {
            let mut links = Vec::new();
            for source in self
                .repository
                .sources(&candidate.profile.id)
                .map_err(ApplicationError::storage)?
            {
                if let Some(analysis) = source.analysis {
                    for repository in analysis.repositories {
                        if !links.contains(&repository.url) {
                            links.push(repository.url);
                        }
                    }
                }
            }
            links
        } else {
            Vec::new()
        };
        let record = fsp_domain::DisclosureRecord {
            candidate_id: candidate.profile.id.clone(),
            company_id: company_id.to_owned(),
            invitation_id: invitation.map(|item| item.id.clone()),
            application_id: None,
            granted_at: invitation.and_then(|item| item.responded_at.clone()),
            name: granted
                .contains("name")
                .then(|| candidate.profile.name.clone()),
            email: granted
                .contains("email")
                .then(|| candidate.profile.email.clone()),
            source_links,
        };
        self.repository
            .save_disclosure(&record)
            .map_err(ApplicationError::storage)
    }

    /// The mock's `getCandidateDisclosure`: the grant row or the explicit
    /// not-granted shell when the company may see the candidate at all.
    pub fn candidate_disclosure(
        &self,
        session: &SessionView,
        requested_candidate_id: &str,
    ) -> Result<DisclosureView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        if let Some(grant) = self
            .repository
            .disclosure(company_id, requested_candidate_id)
            .map_err(ApplicationError::storage)?
        {
            return Ok(DisclosureView {
                candidate_id: grant.candidate_id,
                company_id: grant.company_id,
                granted: true,
                invitation_id: grant.invitation_id,
                application_id: grant.application_id,
                granted_at: grant.granted_at,
                fields: DisclosureFieldsView {
                    name: grant.name,
                    email: grant.email,
                    source_links: (!grant.source_links.is_empty()).then_some(grant.source_links),
                },
            });
        }
        // Without a grant the candidate must still be reachable: the mock's
        // `candidateForCompany` also accepts a live application, which joins
        // this check when applications land.
        self.visible_candidate(requested_candidate_id)?;
        Ok(DisclosureView {
            candidate_id: requested_candidate_id.to_owned(),
            company_id: company_id.to_owned(),
            granted: false,
            invitation_id: None,
            application_id: None,
            granted_at: None,
            fields: DisclosureFieldsView::default(),
        })
    }

    pub fn candidate_search(
        &self,
        session: &SessionView,
        search: CandidateSearch,
    ) -> Result<CandidatePageView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        let need = match search.need_id.as_deref() {
            Some(id) => Some(
                self.repository
                    .need(company_id, id)
                    .map_err(ApplicationError::storage)?
                    .ok_or_else(|| {
                        ApplicationError::new(404, "not_found", "Потребность не найдена")
                    })?,
            ),
            None if search.recommended => {
                return Err(ApplicationError::new(
                    422,
                    "need_required",
                    "Для рекомендаций выберите потребность",
                ));
            }
            None => None,
        };
        let mut records =
            self.repository
                .candidates()
                .map_err(ApplicationError::storage)?
                .into_iter()
                .filter(|item| item.profile.visible_to_employers(item.email_verified))
                .filter(|item| {
                    item.profile.verified_specialization.is_some_and(|value| {
                        search.specialization.is_none_or(|filter| filter == value)
                    }) && item
                        .profile
                        .verified_grade
                        .is_some_and(|value| search.grade.is_none_or(|filter| filter == value))
                        && search.skill.as_ref().is_none_or(|filter| {
                            item.skills.iter().any(|skill| {
                                skill.skill_id == *filter
                                    && skill.status != EvidenceStatus::Insufficient
                            })
                        })
                        && (!search.fsp_verified || item.fsp_verified)
                })
                .collect::<Vec<_>>();
        if search.recommended {
            let selected = need.as_ref().expect("recommended search has a need");
            records.retain(|item| {
                item.profile.verified_specialization == Some(selected.need.specialization)
                    && item
                        .profile
                        .verified_grade
                        .is_some_and(|grade| grade >= selected.need.grade)
            });
        }
        if let Some(selected) = &need {
            let rankable = records
                .iter()
                .filter_map(CandidateIndexRecord::rankable)
                .collect::<Vec<_>>();
            let order = rank_candidates(&rankable, &selected.need)
                .into_iter()
                .enumerate()
                .map(|(position, item)| (item.0, position))
                .collect::<std::collections::HashMap<_, _>>();
            records.sort_by_key(|item| order.get(&item.profile.id).copied().unwrap_or(usize::MAX));
        } else {
            records.sort_by(|left, right| {
                left.profile
                    .verified_specialization
                    .cmp(&right.profile.verified_specialization)
                    .then_with(|| {
                        right
                            .profile
                            .verified_grade
                            .cmp(&left.profile.verified_grade)
                    })
                    .then_with(|| right.fsp_verified.cmp(&left.fsp_verified))
                    .then_with(|| left.profile.id.cmp(&right.profile.id))
            });
        }
        let total = records.len();
        let start = (search.page - 1).saturating_mul(search.page_size);
        let items = records
            .into_iter()
            .skip(start)
            .take(search.page_size)
            .map(|candidate| anonymous_candidate(candidate, need.as_ref()))
            .collect();
        Ok(CandidatePageView {
            items,
            page: search.page,
            page_size: search.page_size,
            total,
            has_next_page: start.saturating_add(search.page_size) < total,
        })
    }

    pub fn candidate(
        &self,
        session: &SessionView,
        candidate_id: &str,
        need_id: Option<&str>,
    ) -> Result<AnonymousCandidateView, ApplicationError> {
        let company_id = employer_company_id(session)?;
        let need = need_id
            .map(|id| self.repository.need(company_id, id))
            .transpose()
            .map_err(ApplicationError::storage)?
            .flatten();
        let candidate = self
            .repository
            .candidates()
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|item| {
                item.profile.id == candidate_id
                    && item.profile.visible_to_employers(item.email_verified)
            })
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Кандидат не найден"))?;
        Ok(anonymous_candidate(candidate, need.as_ref()))
    }

    pub fn github_authorization_url(
        &self,
        session: &SessionView,
        redirect_uri: &str,
    ) -> Result<String, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let github = self.github()?;
        let state = Uuid::new_v4().simple().to_string();
        self.repository
            .save_oauth_state(
                candidate_id,
                &state,
                &(Utc::now() + Duration::minutes(10)).to_rfc3339(),
            )
            .map_err(ApplicationError::storage)?;
        github
            .authorization_url(&state, redirect_uri)
            .map_err(integration_error)
    }

    pub async fn complete_github_authorization(
        &self,
        session: &SessionView,
        state: &str,
        code: &str,
    ) -> Result<(), ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let valid = self
            .repository
            .consume_oauth_state(candidate_id, state, &now())
            .map_err(ApplicationError::storage)?;
        if !valid {
            return Err(ApplicationError::new(
                400,
                "oauth_state_invalid",
                "Ссылка авторизации устарела или уже использована",
            ));
        }
        let token = self
            .github()?
            .exchange_code(code)
            .await
            .map_err(integration_error)?;
        self.repository
            .save_github_token(candidate_id, &token)
            .map_err(ApplicationError::storage)
    }

    pub fn sources(&self, session: &SessionView) -> Result<SourcesView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let mut records = self
            .repository
            .sources(candidate_id)
            .map_err(ApplicationError::storage)?;
        for provider in [
            fsp_domain::SourceProvider::Github,
            fsp_domain::SourceProvider::Fsp,
        ] {
            if !records.iter().any(|record| record.provider == provider) {
                records.push(fsp_domain::SourceRecord {
                    id: format!("source-{}-{candidate_id}", source_provider(provider)),
                    candidate_id: candidate_id.into(),
                    provider,
                    synthetic: provider == fsp_domain::SourceProvider::Fsp,
                    active_job_id: None,
                    account_label: None,
                    last_synced_at: None,
                    analysis: None,
                    verified_participation: false,
                    competition_ids: Vec::new(),
                });
            }
        }
        records.sort_by_key(|record| source_provider(record.provider));
        Ok(SourcesView {
            simulation: records.iter().any(|record| record.synthetic),
            items: records.into_iter().map(source_view).collect(),
        })
    }

    pub fn skills(&self, session: &SessionView) -> Result<SkillsView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let record = self.candidate_index(candidate_id)?;
        let observed_at = record.profile.updated_at.clone();
        let items = record
            .skills
            .into_iter()
            .map(|skill| {
                let evidence = skill
                    .sources
                    .iter()
                    .enumerate()
                    .map(|(index, source)| EvidenceView {
                        id: format!("evidence-{}-{index}", skill.skill_id),
                        source: *source,
                        title: format!("Свидетельство: {}", skill_label(&skill.skill_id)),
                        url: None,
                        reference: Some(format!("{}:{}", source_name(*source), skill.skill_id)),
                        observed_at: observed_at.clone(),
                        scope: "individual",
                        synthetic: *source == fsp_domain::EvidenceSource::Fsp,
                    })
                    .collect::<Vec<_>>();
                SelfSkillView {
                    skill_id: skill.skill_id.clone(),
                    label: skill_label(&skill.skill_id).into(),
                    status: skill.status,
                    evidence_grade: skill.evidence_grade,
                    evidence_sources: skill.sources,
                    summary: skill_summary(skill.status).into(),
                    evidence_count: evidence.len(),
                    confirmed_at: (skill.status == EvidenceStatus::Confirmed)
                        .then(|| observed_at.clone()),
                    evidence,
                }
            })
            .collect();
        Ok(SkillsView {
            items,
            simulation: true,
        })
    }

    pub async fn my_graph(&self, session: &SessionView) -> Result<GraphView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let record = self.candidate_index(candidate_id)?;
        self.graph_from_skills("self", &record.profile.team_role, &record.skills)
            .await
    }

    pub async fn candidate_graph(
        &self,
        session: &SessionView,
        requested_candidate_id: &str,
    ) -> Result<GraphView, ApplicationError> {
        employer_company_id(session)?;
        let record = self.candidate_index(requested_candidate_id)?;
        if !record.profile.visible_to_employers(record.email_verified) {
            return Err(ApplicationError::new(
                404,
                "not_found",
                "Кандидат не найден",
            ));
        }
        self.graph_from_skills("employer", &record.profile.team_role, &record.skills)
            .await
    }

    async fn graph_from_skills(
        &self,
        audience: &'static str,
        subject: &str,
        skills: &[fsp_domain::SkillEvidence],
    ) -> Result<GraphView, ApplicationError> {
        if let Some(llm) = &self.llm {
            let extracted = llm
                .extract_graph(&fsp_domain::GraphExtractionRequest {
                    schema_version: "competence-graph-v1",
                    subject: subject.into(),
                    evidence: skills
                        .iter()
                        .map(|skill| fsp_domain::LlmEvidence {
                            reference: format!("skill:{}", skill.skill_id),
                            text: format!(
                                "{}; status={:?}; grade={:?}; sources={:?}",
                                skill.skill_id, skill.status, skill.evidence_grade, skill.sources
                            ),
                        })
                        .collect(),
                })
                .await
                .map_err(integration_error)?;
            return graph_from_extracted(audience, extracted);
        }
        let root = GraphNodeView {
            id: "role-main".into(),
            kind: "role".into(),
            label: if subject.trim().is_empty() {
                "Профиль компетенций".into()
            } else {
                subject.into()
            },
            skill_id: None,
            status: None,
        };
        let mut nodes = vec![root];
        let mut edges = Vec::new();
        for skill in skills {
            let id = format!("skill-{}", skill.skill_id);
            nodes.push(GraphNodeView {
                id: id.clone(),
                kind: "skill".into(),
                label: skill_label(&skill.skill_id).into(),
                skill_id: Some(skill.skill_id.clone()),
                status: Some(evidence_status_name(skill.status).into()),
            });
            edges.push(GraphEdgeView {
                id: format!("edge-role-{}", skill.skill_id),
                from: "role-main".into(),
                to: id.clone(),
                relation: "uses".into(),
            });
            // Evidence nodes are disclosed only to the candidate, as in the
            // mock's `graph(candidate, audience)`.
            if audience == "self" {
                for index in 0..skill.sources.len() {
                    let evidence_id = format!("evidence-{}-{index}", skill.skill_id);
                    nodes.push(GraphNodeView {
                        id: evidence_id.clone(),
                        kind: "evidence".into(),
                        label: format!("Свидетельство: {}", skill_label(&skill.skill_id)),
                        skill_id: None,
                        status: None,
                    });
                    edges.push(GraphEdgeView {
                        id: format!("edge-{evidence_id}"),
                        from: evidence_id,
                        to: id.clone(),
                        relation: "supports".into(),
                    });
                }
            }
        }
        Ok(GraphView {
            audience,
            nodes,
            edges,
            simulation: true,
        })
    }

    fn candidate_index(&self, id: &str) -> Result<CandidateIndexRecord, ApplicationError> {
        self.repository
            .candidates()
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|record| record.profile.id == id)
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Кандидат не найден"))
    }

    /// Mock-compatible `Idempotency-Key` handling for contract commands that
    /// require it. The key is scoped by actor, operation and path; an
    /// identical payload replays the stored response verbatim, a changed
    /// payload conflicts, and only successful results are stored.
    pub fn idempotent<T, F>(
        &self,
        session: &SessionView,
        context: IdempotencyContext<'_>,
        run: F,
    ) -> Result<Idempotent<T>, ApplicationError>
    where
        T: serde::Serialize,
        F: FnOnce() -> Result<T, ApplicationError>,
    {
        let IdempotencyContext {
            operation,
            path,
            key,
            body,
            status,
        } = context;
        let scope = format!("{}:{}:{}:{}", session.actor_id, operation, path, key);
        // serde_json::Value serializes objects in sorted-key order, matching
        // the mock's stableJson fingerprint.
        let fingerprint = serde_json::to_string(body).map_err(|_| {
            ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
        })?;
        if let Some(stored) = self
            .repository
            .idempotency_get(&scope)
            .map_err(ApplicationError::storage)?
        {
            if stored.fingerprint != fingerprint {
                return Err(ApplicationError::new(
                    409,
                    "idempotency_conflict",
                    "Ключ уже использован с другим запросом",
                ));
            }
            return Ok(Idempotent::Replayed {
                status: stored.status,
                body: stored.body,
            });
        }
        let value = run()?;
        let stored_body = serde_json::to_string(&value).map_err(|_| {
            ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
        })?;
        self.repository
            .idempotency_put(&scope, &fingerprint, status, &stored_body, &now())
            .map_err(ApplicationError::storage)?;
        Ok(Idempotent::Fresh(value))
    }

    /// Mirrors the mock's `processing(candidate)` guard on data-processing
    /// operations (source connect/sync, assessments, task responses, …).
    fn require_processing_consent(&self, candidate_id: &str) -> Result<(), ApplicationError> {
        let profile = self
            .repository
            .candidate(candidate_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Кандидат не найден"))?;
        if !profile.consents.processing {
            return Err(ApplicationError::new(
                403,
                "processing_consent_required",
                "Для обработки данных необходимо согласие",
            ));
        }
        Ok(())
    }

    pub async fn connect_source(
        &self,
        session: &SessionView,
        provider: &str,
        input: SourceConnectInput,
    ) -> Result<SourceView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        self.require_processing_consent(candidate_id)?;
        let account = input.account.trim();
        if account.is_empty() || account.len() > 100 {
            return Err(validation("Проверьте идентификатор аккаунта"));
        }
        let record = match provider {
            "github" => {
                let token = self
                    .repository
                    .github_token(candidate_id)
                    .map_err(ApplicationError::storage)?
                    .ok_or_else(|| {
                        ApplicationError::new(
                            409,
                            "github_authorization_required",
                            "Сначала авторизуйте доступ к GitHub",
                        )
                    })?;
                let analysis = self
                    .github()?
                    .analyze(account, &token)
                    .await
                    .map_err(integration_error)?;
                fsp_domain::SourceRecord {
                    id: format!("source-github-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    provider: fsp_domain::SourceProvider::Github,
                    synthetic: false,
                    active_job_id: None,
                    account_label: Some(analysis.username.clone()),
                    last_synced_at: Some(now()),
                    analysis: Some(analysis),
                    verified_participation: false,
                    competition_ids: Vec::new(),
                }
            }
            "fsp" => {
                let participation = self
                    .fsp
                    .as_ref()
                    .ok_or_else(|| {
                        ApplicationError::new(503, "fsp_not_configured", "Источник ФСП недоступен")
                    })?
                    .participation(account)
                    .map_err(integration_error)?;
                fsp_domain::SourceRecord {
                    id: format!("source-fsp-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    provider: fsp_domain::SourceProvider::Fsp,
                    synthetic: true,
                    active_job_id: None,
                    account_label: Some(participation.account_label),
                    last_synced_at: Some(now()),
                    analysis: None,
                    verified_participation: participation.verified,
                    competition_ids: participation.competition_ids,
                }
            }
            _ => {
                return Err(ApplicationError::new(
                    404,
                    "not_found",
                    "Источник не найден",
                ));
            }
        };
        self.repository
            .save_source(&record)
            .map_err(ApplicationError::storage)?;
        Ok(source_view(record))
    }

    pub async fn sync_source(
        &self,
        session: &SessionView,
        source_id: &str,
    ) -> Result<JobView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        self.require_processing_consent(candidate_id)?;
        let source = self
            .repository
            .sources(candidate_id)
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.id == source_id)
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Источник не найден"))?;
        // A source already being synced returns its running job, like the mock.
        if let Some(active_job_id) = &source.active_job_id
            && let Some(active) = self
                .repository
                .job(candidate_id, active_job_id)
                .map_err(ApplicationError::storage)?
            && active.status != "succeeded"
            && active.status != "failed"
        {
            return Ok(job_view(active, Some(source_view(source))));
        }
        let created_at = now();
        let mut job = fsp_domain::JobRecord {
            id: format!("job-{}", Uuid::new_v4().simple()),
            owner_id: candidate_id.into(),
            status: "running".into(),
            created_at: created_at.clone(),
            updated_at: created_at,
            result_source_id: None,
            error_code: None,
            error_message: None,
        };
        let result = match source.provider {
            fsp_domain::SourceProvider::Github => {
                let token = self
                    .repository
                    .github_token(candidate_id)
                    .map_err(ApplicationError::storage)?
                    .ok_or_else(|| {
                        ApplicationError::new(
                            409,
                            "github_authorization_required",
                            "Авторизуйте GitHub повторно",
                        )
                    })?;
                let username = source.account_label.as_deref().ok_or_else(|| {
                    ApplicationError::new(
                        409,
                        "source_not_connected",
                        "Сначала подключите источник",
                    )
                })?;
                self.github()?
                    .analyze(username, &token)
                    .await
                    .map(|analysis| fsp_domain::SourceRecord {
                        analysis: Some(analysis),
                        last_synced_at: Some(now()),
                        active_job_id: None,
                        ..source
                    })
            }
            fsp_domain::SourceProvider::Fsp => Ok(fsp_domain::SourceRecord {
                last_synced_at: Some(now()),
                active_job_id: None,
                ..source
            }),
        };
        match result {
            Ok(updated) => {
                self.repository
                    .save_source(&updated)
                    .map_err(ApplicationError::storage)?;
                job.status = "succeeded".into();
                job.updated_at = now();
                job.result_source_id = Some(updated.id.clone());
                self.repository
                    .save_job(&job)
                    .map_err(ApplicationError::storage)?;
                Ok(job_view(job, Some(source_view(updated))))
            }
            Err(error) => {
                job.status = "failed".into();
                job.updated_at = now();
                job.error_code = Some(error.code.into());
                job.error_message = Some(error.message);
                self.repository
                    .save_job(&job)
                    .map_err(ApplicationError::storage)?;
                Ok(job_view(job, None))
            }
        }
    }

    pub fn job(&self, session: &SessionView, job_id: &str) -> Result<JobView, ApplicationError> {
        let owner_id = session
            .candidate_id
            .as_deref()
            .or(session.company_id.as_deref())
            .ok_or_else(|| ApplicationError::new(403, "role_forbidden", "Недоступная операция"))?;
        let record = self
            .repository
            .job(owner_id, job_id)
            .map_err(ApplicationError::storage)?
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Задача не найдена"))?;
        let source = if let Some(source_id) = record.result_source_id.as_ref() {
            self.repository
                .sources(owner_id)
                .map_err(ApplicationError::storage)?
                .into_iter()
                .find(|source| &source.id == source_id)
                .map(source_view)
        } else {
            None
        };
        Ok(job_view(record, source))
    }

    fn github(&self) -> Result<&Arc<dyn GitHubGateway>, ApplicationError> {
        self.github.as_ref().ok_or_else(|| {
            ApplicationError::new(
                503,
                "github_not_configured",
                "Подключение GitHub временно недоступно",
            )
        })
    }

    fn register_account(&self, email: String, role: Role) -> Result<Account, ApplicationError> {
        let suffix = Uuid::new_v4().simple().to_string();
        let account = Account {
            id: format!("actor-{}", &suffix[..12]),
            email: email.clone(),
            role,
            candidate_id: (role == Role::Candidate).then(|| format!("candidate-{}", &suffix[..12])),
            company_id: (role == Role::Employer).then(|| format!("company-{}", &suffix[..12])),
            email_verified: false,
        };
        self.repository
            .create_account(&account, &now())
            .map_err(ApplicationError::storage)?;
        if let Some(candidate_id) = &account.candidate_id {
            self.repository
                .create_candidate(&CandidateProfile {
                    id: candidate_id.clone(),
                    alias: format!("Кандидат №{}", suffix[..3].to_uppercase()),
                    email: email.clone(),
                    name: "Новый кандидат".into(),
                    specialization: Specialization::Backend,
                    selected_grade: Grade::Junior,
                    stack: Vec::new(),
                    team_role: String::new(),
                    experience_months: None,
                    experience: String::new(),
                    soft_skills: Vec::new(),
                    consents: Consents {
                        processing: false,
                        publication: false,
                    },
                    verified_grade: None,
                    verified_specialization: None,
                    grade_confirmed_at: None,
                    revision: 1,
                    updated_at: now(),
                })
                .map_err(ApplicationError::storage)?;
        }
        if let Some(company_id) = &account.company_id {
            self.repository
                .create_company(&Company {
                    id: company_id.clone(),
                    display_name: "Новая компания".into(),
                    business_area: String::new(),
                    description: String::new(),
                    contact_email: email,
                    website: None,
                })
                .map_err(ApplicationError::storage)?;
        }
        Ok(account)
    }

    fn session_view(&self, account: &Account) -> Result<SessionView, ApplicationError> {
        let display_name = if let Some(id) = &account.candidate_id {
            self.repository
                .candidate(id)
                .map_err(ApplicationError::storage)?
                .map(|profile| profile.name)
                .unwrap_or_else(|| "Кандидат".into())
        } else if let Some(id) = &account.company_id {
            self.repository
                .company(id)
                .map_err(ApplicationError::storage)?
                .map(|company| company.display_name)
                .unwrap_or_else(|| "Работодатель".into())
        } else {
            String::new()
        };
        Ok(SessionView {
            actor_id: account.id.clone(),
            role: account.role,
            email_verified: account.email_verified,
            candidate_id: account.candidate_id.clone(),
            company_id: account.company_id.clone(),
            display_name,
        })
    }
}

fn employer_company_id(session: &SessionView) -> Result<&str, ApplicationError> {
    session.company_id.as_deref().ok_or_else(|| {
        ApplicationError::new(403, "role_forbidden", "Действие доступно работодателю")
    })
}

fn candidate_id(session: &SessionView) -> Result<&str, ApplicationError> {
    session
        .candidate_id
        .as_deref()
        .ok_or_else(|| ApplicationError::new(403, "role_forbidden", "Действие доступно кандидату"))
}

fn integration_error(error: IntegrationError) -> ApplicationError {
    ApplicationError::new(502, error.code, error.message)
}

fn source_provider(provider: fsp_domain::SourceProvider) -> &'static str {
    match provider {
        fsp_domain::SourceProvider::Github => "github",
        fsp_domain::SourceProvider::Fsp => "fsp",
    }
}

fn source_name(source: fsp_domain::EvidenceSource) -> &'static str {
    match source {
        fsp_domain::EvidenceSource::Assessment => "assessment",
        fsp_domain::EvidenceSource::Github => "github",
        fsp_domain::EvidenceSource::Fsp => "fsp",
    }
}

fn evidence_status_name(status: EvidenceStatus) -> &'static str {
    match status {
        EvidenceStatus::Confirmed => "confirmed",
        EvidenceStatus::Evidence => "evidence",
        EvidenceStatus::Observed => "observed",
        EvidenceStatus::Insufficient => "insufficient",
    }
}

fn graph_from_extracted(
    audience: &'static str,
    graph: fsp_domain::ExtractedGraph,
) -> Result<GraphView, ApplicationError> {
    let valid_nodes = graph.nodes.iter().all(|node| {
        ["role", "skill", "evidence"].contains(&node.kind.as_str())
            && node.status.as_deref().is_none_or(|status| {
                ["confirmed", "evidence", "observed", "insufficient"].contains(&status)
            })
    });
    let valid_edges = graph
        .edges
        .iter()
        .all(|edge| ["requires", "supports", "uses"].contains(&edge.relation.as_str()));
    if !valid_nodes || !valid_edges {
        return Err(ApplicationError::new(
            502,
            "bifrost_invalid_response",
            "Модель вернула граф неподдерживаемого формата",
        ));
    }
    Ok(GraphView {
        audience,
        nodes: graph
            .nodes
            .into_iter()
            .map(|node| GraphNodeView {
                id: node.id,
                kind: node.kind,
                label: node.label,
                skill_id: node.skill_id,
                status: node.status,
            })
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .map(|edge| GraphEdgeView {
                id: edge.id,
                from: edge.from,
                to: edge.to,
                relation: edge.relation,
            })
            .collect(),
        simulation: false,
    })
}

fn need_view(record: HiringNeedRecord) -> NeedView {
    NeedView {
        id: record.id,
        company_id: record.company_id,
        title: record.title,
        specialization: record.need.specialization,
        grade: record.need.grade,
        work_mode: record.work_mode,
        salary: SalaryView {
            from: record.salary_from,
            to: record.salary_to,
            currency: "RUB",
            period: "month",
            tax_basis: "gross",
        },
        description: record.description,
        requirements: record
            .need
            .requirements
            .into_iter()
            .map(|item| RequirementView {
                skill_id: item.skill_id,
                criticality: item.criticality,
                minimum_grade: item.minimum_grade,
                evidence_policy: EvidencePolicyView::from(&item.evidence_policy),
            })
            .collect(),
        published: record.published,
        published_at: record.published_at,
        created_at: record.created_at,
        updated_at: record.updated_at,
        revision: record.revision,
    }
}

fn invitation_view(record: fsp_domain::InvitationRecord) -> InvitationView {
    InvitationView {
        id: record.id,
        candidate_id: record.candidate_id,
        candidate_alias: record.candidate_alias,
        company: CompanyCardView {
            id: record.company.id,
            display_name: record.company.display_name,
            business_area: record.company.business_area,
            description: record.company.description,
            contact_email: record.company.contact_email,
        },
        need: InvitationNeedView {
            id: record.need.id,
            title: record.need.title,
            work_mode: record.need.work_mode,
            salary: SalaryView {
                from: record.need.salary_from,
                to: record.need.salary_to,
                currency: "RUB",
                period: "month",
                tax_basis: "gross",
            },
            description: record.need.description,
        },
        message: record.message,
        status: record.status,
        created_at: record.created_at,
        viewed_at: record.viewed_at,
        responded_at: record.responded_at,
        disclosure_fields: record.disclosure_fields,
    }
}

/// The contract's `disclose` array: at least one field, unique, from the
/// disclosure enum.
fn validate_disclose(disclose: &[String]) -> Result<(), ApplicationError> {
    const FIELDS: [&str; 3] = ["name", "email", "sourceLinks"];
    let unique = disclose.iter().collect::<std::collections::BTreeSet<_>>();
    if disclose.is_empty()
        || unique.len() != disclose.len()
        || disclose
            .iter()
            .any(|field| !FIELDS.contains(&field.as_str()))
    {
        return Err(validation("Запрос не соответствует контракту"));
    }
    Ok(())
}

fn anonymous_candidate(
    record: CandidateIndexRecord,
    need: Option<&HiringNeedRecord>,
) -> AnonymousCandidateView {
    let rankable = record.rankable().expect("visible candidate is rankable");
    let candidate_match = need.map(|selected| match_view(&rankable, selected));
    AnonymousCandidateView {
        id: record.profile.id,
        alias: record.profile.alias,
        specialization: rankable.specialization,
        verified_grade: rankable.verified_grade,
        grade_confirmed_at: record.profile.grade_confirmed_at.unwrap_or_default(),
        work_modes: record.work_modes,
        available_for_offers: record.available_for_offers,
        skills: record
            .skills
            .into_iter()
            .map(|skill| SkillView {
                label: skill_label(&skill.skill_id).into(),
                summary: skill_summary(skill.status).into(),
                evidence_count: skill.sources.len(),
                confirmed_at: (skill.status == EvidenceStatus::Confirmed)
                    .then(|| record.profile.updated_at.clone()),
                skill_id: skill.skill_id,
                status: skill.status,
                evidence_grade: skill.evidence_grade,
                evidence_sources: skill.sources,
            })
            .collect(),
        source_kinds: record.source_kinds,
        fsp_verified: record.fsp_verified,
        freshness: freshness_view(record.last_signal_at.clone()),
        r#match: candidate_match,
        simulation: true,
    }
}

fn match_view(
    candidate: &fsp_domain::RankableCandidate,
    need: &HiringNeedRecord,
) -> CandidateMatchView {
    let result = score(candidate, &need.need);
    let requirements = need
        .need
        .requirements
        .iter()
        .map(|requirement| match_requirement(candidate, requirement))
        .collect::<Vec<_>>();
    let status = match_status(&result, &requirements);
    CandidateMatchView {
        need_id: need.id.clone(),
        status,
        grade_matches: result.grade_matches,
        required_met: result.required_met,
        required_total: result.required_total,
        desired_met: result.desired_met,
        desired_total: result.desired_total,
        requirements,
        explanation: if result.grade_matches {
            format!(
                "Подтверждено обязательных требований: {} из {}.",
                result.required_met, result.required_total
            )
        } else {
            "Подтверждённая специализация или грейд пока не соответствуют потребности.".into()
        },
        algorithm_version: result.algorithm_version,
    }
}

fn match_requirement(
    candidate: &fsp_domain::RankableCandidate,
    requirement: &Requirement,
) -> MatchRequirementView {
    let skill = candidate
        .skills
        .iter()
        .find(|item| item.skill_id == requirement.skill_id);
    // Like the mock's match(): only an assessment the policy accepts counts
    // toward `meets`; other sources keep the requirement at needs_verification.
    let accepted_assessment = requirement.evidence_policy.accept_assessments
        && skill.is_some_and(|item| {
            item.sources
                .contains(&fsp_domain::EvidenceSource::Assessment)
        });
    let meets = skill.is_some_and(|item| {
        item.status == EvidenceStatus::Confirmed
            && accepted_assessment
            && item
                .evidence_grade
                .is_some_and(|grade| grade >= requirement.minimum_grade)
    });
    let evidence_status = skill.map_or(EvidenceStatus::Insufficient, |item| item.status);
    let status = if meets {
        "meets"
    } else if skill.is_none_or(|item| item.status == EvidenceStatus::Insufficient) {
        "not_evidenced"
    } else {
        "needs_verification"
    };
    MatchRequirementView {
        skill_id: requirement.skill_id.clone(),
        criticality: requirement.criticality,
        status,
        evidence_status,
        reason: if meets {
            "Навык подтверждён проверкой нужного уровня, которую принимает работодатель."
        } else if status == "not_evidenced" {
            "Пока нет достаточных свидетельств по этому навыку."
        } else if !accepted_assessment
            && skill.is_some_and(|item| item.status == EvidenceStatus::Confirmed)
        {
            "Имеющееся подтверждение не соответствует политике этой потребности."
        } else {
            "Есть основания, но уровень по этому требованию ещё следует подтвердить."
        },
    }
}

fn skill_label(skill_id: &str) -> &str {
    match skill_id {
        "rust" => "Rust",
        "postgresql" => "PostgreSQL",
        "docker" => "Docker",
        "redis" => "Redis",
        "react" => "React",
        _ => skill_id,
    }
}

fn skill_summary(status: EvidenceStatus) -> &'static str {
    match status {
        EvidenceStatus::Confirmed => "Навык подтверждён проверяемым свидетельством.",
        EvidenceStatus::Evidence => "Есть свидетельства, требуется подтверждение уровня.",
        EvidenceStatus::Observed => "Навык обнаружен в подключённых источниках.",
        EvidenceStatus::Insufficient => "Недостаточно данных для подтверждения.",
    }
}

/// The mock's `FRESHNESS_DAYS`: a verified grade or a counted task answer keeps a
/// profile fresh for this window.
const FRESHNESS_DAYS: i64 = 90;
/// `successfulGradeChangeCooldownDays` from `meta.assessmentPolicy`.
const GRADE_COOLDOWN_DAYS: i64 = 90;

fn freshness_view(last_signal_at: Option<String>) -> FreshnessView {
    let fresh = last_signal_at
        .as_deref()
        .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
        .is_some_and(|at| Utc::now() - at.with_timezone(&Utc) <= Duration::days(FRESHNESS_DAYS));
    FreshnessView {
        last_signal: last_signal_at.as_ref().map(|_| "assessment"),
        last_signal_at,
        fresh,
        window_days: FRESHNESS_DAYS as u16,
    }
}

fn profile_view(profile: CandidateProfile, email_verified: bool) -> ProfileView {
    let questionnaire_complete = profile.questionnaire_complete();
    let assessment_passed =
        profile.verified_grade.is_some() && profile.verified_specialization.is_some();
    let visible = profile.visible_to_employers(email_verified);
    let mut blockers = Vec::new();
    if !email_verified {
        blockers.push("email");
    }
    if !questionnaire_complete {
        blockers.push("questionnaire");
    }
    if !assessment_passed {
        blockers.push("assessment");
    }
    if !profile.consents.processing {
        blockers.push("processing_consent");
    }
    if !profile.consents.publication {
        blockers.push("publication_consent");
    }
    let processing_consent = profile.consents.processing;
    // Mirrors the mock's eligibility(): onboarding gates starting any check; a
    // successful verification freezes upgrades for the cooldown window; the
    // selected scope additionally rejects non-backend specializations and
    // downgrades.
    let onboarding_incomplete = !(email_verified && questionnaire_complete && processing_consent);
    let next_eligible_at = profile
        .grade_confirmed_at
        .as_deref()
        .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
        .map(|at| (at + Duration::days(GRADE_COOLDOWN_DAYS)).to_rfc3339());
    let cooling = next_eligible_at
        .as_deref()
        .is_some_and(|at| at > Utc::now().to_rfc3339().as_str());
    let same_grade = profile.verified_grade == Some(profile.selected_grade)
        && profile.verified_specialization == Some(profile.specialization);
    let reason = if onboarding_incomplete {
        Some("onboarding_incomplete")
    } else if cooling {
        Some("cooldown")
    } else {
        None
    };
    let selected_reason = if onboarding_incomplete {
        Some("onboarding_incomplete")
    } else if profile.specialization != Specialization::Backend {
        Some("unsupported_scope")
    } else if profile.verified_specialization == Some(profile.specialization)
        && profile
            .verified_grade
            .is_some_and(|grade| profile.selected_grade < grade)
    {
        Some("grade_downgrade")
    } else if cooling && !same_grade {
        Some("cooldown")
    } else {
        None
    };
    ProfileView {
        id: profile.id,
        alias: profile.alias,
        email: profile.email,
        email_verified,
        name: profile.name,
        industry: "it",
        specialization: profile.specialization,
        selected_grade: profile.selected_grade,
        stack: profile.stack,
        team_role: profile.team_role,
        experience_months: profile.experience_months,
        experience: profile.experience,
        soft_skills: profile.soft_skills,
        consents: profile.consents,
        verified_grade: profile.verified_grade,
        verified_specialization: profile.verified_specialization,
        grade_confirmed_at: profile.grade_confirmed_at.clone(),
        category: CategoryView {
            specialization: profile.verified_specialization,
            grade: profile.verified_grade,
            eligible: visible,
        },
        freshness: freshness_view(profile.grade_confirmed_at.clone()),
        onboarding: OnboardingView {
            email_verified,
            questionnaire_complete,
            assessment_passed,
            ready_for_publication: email_verified
                && questionnaire_complete
                && assessment_passed
                && processing_consent,
            visible_to_employers: visible,
            blockers,
        },
        assessment_eligibility: GradeEligibilityView {
            selected_specialization: profile.specialization,
            selected_grade: profile.selected_grade,
            can_start_selected: selected_reason.is_none(),
            selected_reason,
            can_start_upgrade: reason.is_none(),
            next_eligible_at,
            cooldown_days: GRADE_COOLDOWN_DAYS as u16,
            reason,
        },
        revision: profile.revision,
        updated_at: profile.updated_at,
    }
}

fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn unique(values: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for value in values {
        if !result.contains(&value) {
            result.push(value);
        }
    }
    result
}

fn validate_profile_patch(patch: &ProfilePatch) -> Result<(), ApplicationError> {
    let has_property = patch.name.is_some()
        || patch.industry.is_some()
        || patch.specialization.is_some()
        || patch.selected_grade.is_some()
        || patch.stack.is_some()
        || patch.team_role.is_some()
        || patch.experience_months.is_some()
        || patch.experience.is_some()
        || patch.soft_skills.is_some()
        || patch.consents.is_some();
    if !has_property {
        return Err(validation("Передайте хотя бы одно поле профиля"));
    }
    if patch
        .name
        .as_ref()
        .is_some_and(|value| value.trim().is_empty() || value.chars().count() > 120)
    {
        return Err(validation("Имя должно содержать от 1 до 120 символов"));
    }
    if patch.industry.as_deref().is_some_and(|value| value != "it") {
        return Err(validation("Поддерживается только ИТ-специализация"));
    }
    if patch
        .experience_months
        .is_some_and(|value| value.is_some_and(|months| months > 1200))
    {
        return Err(validation("Опыт не может превышать 1200 месяцев"));
    }
    if patch
        .team_role
        .as_ref()
        .is_some_and(|value| value.chars().count() > 120)
        || patch
            .experience
            .as_ref()
            .is_some_and(|value| value.chars().count() > 4000)
    {
        return Err(validation("Текстовое поле превышает допустимую длину"));
    }
    if let Some(stack) = &patch.stack {
        let supported = ["rust", "postgresql", "docker", "redis", "react"];
        if stack.len() > 5
            || stack
                .iter()
                .any(|value| !supported.contains(&value.as_str()))
            || unique_count(stack) != stack.len()
        {
            return Err(validation("Проверьте технологии в стеке"));
        }
    }
    if patch.soft_skills.as_ref().is_some_and(|values| {
        values.len() > 12
            || values.iter().any(|value| value.chars().count() > 100)
            || unique_count(values) != values.len()
    }) {
        return Err(validation("Проверьте список гибких навыков"));
    }
    Ok(())
}

fn validate_company_patch(patch: &CompanyPatch) -> Result<(), ApplicationError> {
    let has_property = patch.display_name.is_some()
        || patch.business_area.is_some()
        || patch.description.is_some()
        || patch.contact_email.is_some()
        || patch.website.is_some();
    if !has_property {
        return Err(validation("Передайте хотя бы одно поле компании"));
    }
    Ok(())
}

fn unique_count(values: &[String]) -> usize {
    let mut deduplicated = values.to_vec();
    deduplicated.sort();
    deduplicated.dedup();
    deduplicated.len()
}

fn validation(message: &'static str) -> ApplicationError {
    ApplicationError::new(400, "validation_error", message)
}

/// Schema-level ids the contract enumerates.
const CATALOG_SKILLS: &[&str] = &["rust", "postgresql", "docker", "redis", "react"];
const WORK_MODES: &[&str] = &["remote", "hybrid", "office"];
/// Competition ids the meta catalog advertises.
const COMPETITION_IDS: &[&str] = &["competition-demo-api", "competition-demo-systems"];

/// Contract schema checks the mock performs through ajv: lengths, ranges and
/// enumerated values map to `validation_error`.
fn validate_need_schema(
    title: &str,
    work_mode: &str,
    description: &str,
    requirements: &[fsp_domain::Requirement],
) -> Result<(), ApplicationError> {
    if !(1..=160).contains(&title.chars().count())
        || description.chars().count() > 6000
        || requirements.is_empty()
        || requirements.len() > 5
        || !WORK_MODES.contains(&work_mode)
    {
        return Err(validation("Запрос не соответствует контракту"));
    }
    validate_requirements_schema(requirements)
}

fn validate_requirements_schema(
    requirements: &[fsp_domain::Requirement],
) -> Result<(), ApplicationError> {
    let invalid = requirements.iter().any(|item| {
        !CATALOG_SKILLS.contains(&item.skill_id.as_str())
            || !matches!(
                item.evidence_policy.competition_selection.as_str(),
                "system" | "selected"
            )
            || item
                .evidence_policy
                .competition_ids
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != item.evidence_policy.competition_ids.len()
    });
    if invalid {
        return Err(validation("Запрос не соответствует контракту"));
    }
    Ok(())
}

/// The mock's `validateNeed` business rules, in the same order.
fn validate_need_rules(
    salary_from: u64,
    salary_to: u64,
    requirements: &[fsp_domain::Requirement],
) -> Result<(), ApplicationError> {
    if salary_from == 0 || salary_to == 0 || salary_from > 100_000_000 || salary_to > 100_000_000 {
        return Err(validation("Запрос не соответствует контракту"));
    }
    if salary_from > salary_to {
        return Err(ApplicationError::new(
            422,
            "salary_range_invalid",
            "Минимальная зарплата не может превышать максимальную",
        ));
    }
    let unique = requirements
        .iter()
        .map(|item| &item.skill_id)
        .collect::<std::collections::HashSet<_>>();
    if unique.len() != requirements.len() {
        return Err(ApplicationError::new(
            422,
            "duplicate_skill",
            "Навык нельзя повторять в требованиях",
        ));
    }
    if !requirements
        .iter()
        .any(|item| item.criticality == fsp_domain::Criticality::Required)
    {
        return Err(ApplicationError::new(
            422,
            "required_skill_missing",
            "Укажите хотя бы одно обязательное требование",
        ));
    }
    for requirement in requirements {
        let policy = &requirement.evidence_policy;
        if !policy.accept_assessments && !policy.accept_github && !policy.accept_fsp {
            return Err(ApplicationError::new(
                422,
                "empty_evidence_policy",
                "Выберите хотя бы один источник свидетельств",
            ));
        }
        if policy
            .competition_ids
            .iter()
            .any(|id| !COMPETITION_IDS.contains(&id.as_str()))
        {
            return Err(ApplicationError::new(
                422,
                "unknown_competition",
                "Неизвестное соревнование",
            ));
        }
        if policy.competition_selection == "system" && !policy.competition_ids.is_empty() {
            return Err(ApplicationError::new(
                422,
                "ambiguous_competition_policy",
                "При системном выборе список соревнований должен быть пуст",
            ));
        }
        if policy.accept_fsp
            && policy.competition_selection == "selected"
            && policy.competition_ids.is_empty()
        {
            return Err(ApplicationError::new(
                422,
                "competition_required",
                "Укажите принимаемые соревнования",
            ));
        }
    }
    Ok(())
}
