use std::sync::Arc;

use chrono::{Duration, Utc};
use fsp_domain::{Account, CandidateProfile, Company, Consents, Grade, Role, Specialization};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    CategoryView, CompanyPatch, CompanyView, ConsumeChallenge, EmailChallengeInput,
    EmailChallengeView, EmailVerifyInput, FreshnessView, GradeEligibilityView, OnboardingView,
    PendingChallenge, PlatformRepository, ProfilePatch, ProfileView, RepositoryError, SessionView,
    VerificationDelivery,
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
        Self::new(500, "storage_error", format!("Ошибка хранилища: {error:?}"))
    }
}

pub struct PlatformService {
    repository: Arc<dyn PlatformRepository>,
    delivery: Arc<dyn VerificationDelivery>,
}

impl PlatformService {
    pub fn new(
        repository: Arc<dyn PlatformRepository>,
        delivery: Arc<dyn VerificationDelivery>,
    ) -> Self {
        Self {
            repository,
            delivery,
        }
    }

    pub fn initialize(&self) -> Result<(), ApplicationError> {
        self.repository
            .seed_demo(&now())
            .map_err(ApplicationError::storage)
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
            return Err(ApplicationError::new(
                400,
                "invalid_code",
                "Неверный код подтверждения",
            ));
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
                    "Слишком много неверных попыток",
                ));
            }
            ConsumeChallenge::WrongCode => {
                return Err(ApplicationError::new(
                    400,
                    "invalid_code",
                    "Неверный код подтверждения",
                ));
            }
        }
        let account = account
            .ok_or_else(|| ApplicationError::new(500, "storage_error", "Аккаунт не найден"))?;
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
                422,
                "publication_requires_processing",
                "Для публикации нужно согласие на обработку данных",
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

fn profile_view(profile: CandidateProfile, email_verified: bool) -> ProfileView {
    let questionnaire_complete = profile.questionnaire_complete();
    let assessment_passed = profile.verified_grade.is_some();
    let visible = profile.visible_to_employers();
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
    let can_start = email_verified && questionnaire_complete;
    let processing_consent = profile.consents.processing;
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
        grade_confirmed_at: profile.grade_confirmed_at,
        category: CategoryView {
            specialization: profile.verified_specialization,
            grade: profile.verified_grade,
            eligible: assessment_passed,
        },
        freshness: FreshnessView {
            last_signal_at: None,
            last_signal: None,
            fresh: false,
            window_days: 90,
        },
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
            can_start_selected: can_start,
            selected_reason: (!can_start).then_some("onboarding_incomplete"),
            can_start_upgrade: can_start,
            next_eligible_at: None,
            cooldown_days: 0,
            reason: (!can_start).then_some("onboarding_incomplete"),
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
