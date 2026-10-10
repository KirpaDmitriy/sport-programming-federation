//! The automatic profile: specialization, grade and questionnaire answers estimated from evidence.
//!
//! Rules are deterministic and documented in `docs/auto-profile.md`. Every factor keeps its points
//! and an explanation, so the candidate and the employer see why an estimate came out as it did.
//! An LLM review may only choose between close specializations and lower the confidence.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    Archetype, FspResult, GitHubDimensionId, GitHubReport, Grade, SignalConfidence, Specialization,
};

pub const ESTIMATE_VERSION: &str = "estimate-v2";

/// Stack items an automatic profile fills in.
const STACK_LIMIT: usize = 12;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEstimate {
    pub version: String,
    pub computed_at: String,
    /// `None` when the evidence names no specialization.
    pub specialization: Option<Specialization>,
    /// The leading specializations with their shares, highest first.
    pub specializations: Vec<SpecializationShare>,
    /// `None` when there is too little evidence for a grade.
    pub grade: Option<Grade>,
    /// Seniority score, 0–100.
    pub score: u8,
    pub confidence: SignalConfidence,
    pub factors: Vec<EstimateFactor>,
    /// Profile answers derived from the evidence.
    pub answers: EstimateAnswers,
    /// Where the evidence came from.
    pub sources: Vec<String>,
    /// Why there is no grade, when there is none.
    pub insufficient: Option<String>,
    pub review: Option<EstimateReview>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecializationShare {
    pub id: Specialization,
    pub percent: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateFactor {
    pub id: String,
    pub label: String,
    pub points: u8,
    pub max: u8,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateAnswers {
    pub stack: Vec<String>,
    pub experience_months: Option<u32>,
    pub experience: String,
    pub team_role: String,
    pub name: Option<String>,
}

/// The LLM's second opinion, validated against the catalog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateReview {
    pub specialization: Specialization,
    pub grade: Grade,
    pub rationale: String,
    /// Whether the review agreed with the rule-based grade.
    pub agrees: bool,
}

/// What the LLM returns before it is applied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileReviewReply {
    pub specialization: Specialization,
    pub grade: Grade,
    pub rationale: String,
    pub experience: String,
    pub team_role: String,
}

/// Anonymized evidence for the LLM: no login, names or links.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileReviewRequest {
    pub summary: String,
    pub specializations: Vec<SpecializationShare>,
    pub rule_grade: Option<Grade>,
    pub score: u8,
    pub factors: Vec<EstimateFactor>,
    pub stack: Vec<String>,
    pub experience_months: Option<u32>,
    pub fsp_results: Vec<String>,
}

pub struct EstimateInput<'a> {
    pub github: Option<&'a GitHubReport>,
    pub fsp: &'a [FspResult],
    /// Experience the candidate stated or imported from a résumé, in months.
    pub stated_experience_months: Option<u32>,
    pub now: &'a str,
}

/// Estimates the profile from the evidence; deterministic for the same input.
#[must_use]
pub fn estimate_profile(input: &EstimateInput<'_>) -> ProfileEstimate {
    let published = input
        .fsp
        .iter()
        .filter(|result| result.status == "published")
        .collect::<Vec<_>>();
    let mut sources = Vec::new();
    if input.github.is_some() {
        sources.push("github".to_owned());
    }
    if !published.is_empty() {
        sources.push("fsp".to_owned());
    }
    let specializations = specialization_shares(input.github, &published);
    let specialization = specializations.first().map(|share| share.id);

    let mut factors = Vec::new();
    let mut base = 0.0;
    if let Some(report) = input.github {
        for (id, label, weight) in DIMENSION_WEIGHTS {
            let score = dimension(report, id);
            let points = (f64::from(score) * weight).round();
            base += points;
            factors.push(EstimateFactor {
                id: format!("github_{}", dimension_key(id)),
                label: label.into(),
                points: points as u8,
                max: (100.0 * weight).round() as u8,
                detail: report
                    .dimensions
                    .iter()
                    .find(|item| item.id == id)
                    .map_or_else(String::new, |item| item.summary.clone()),
            });
        }
    }
    let public_months = input.github.and_then(public_experience_months);
    let experience_months = match (input.stated_experience_months, public_months) {
        (Some(stated), Some(public)) => Some(stated.max(public)),
        (stated, public) => stated.or(public),
    };
    if let Some(stated) = input.stated_experience_months {
        // Stated experience covers private work the public evidence cannot see.
        let points = (ramp(f64::from(stated), 0.0, 96.0) * 30.0).round();
        if input.github.is_some() {
            base = base * 0.7 + points;
        } else {
            base = points;
        }
        factors.push(EstimateFactor {
            id: "stated_experience".into(),
            label: "Опыт по анкете или резюме".into(),
            points: points as u8,
            max: 30,
            detail: format!("{} мес. опыта", stated),
        });
    }
    let fsp_points = fsp_points(&published);
    if !published.is_empty() {
        factors.push(EstimateFactor {
            id: "fsp".into(),
            label: "Результаты соревнований ФСП".into(),
            points: fsp_points,
            max: FSP_MAX,
            detail: fsp_detail(&published),
        });
    }
    // Competition results alone show skill but not work experience: they reach junior at most.
    let fsp_weight = if input.github.is_none() && input.stated_experience_months.is_none() {
        2.0
    } else {
        1.0
    };
    let score = (base + f64::from(fsp_points) * fsp_weight)
        .round()
        .clamp(0.0, 100.0) as u8;

    let (grade, insufficient) = if input.github.is_none()
        && published.is_empty()
        && input.stated_experience_months.is_none()
    {
        (
            None,
            Some("Подключите GitHub или ФСП, чтобы оценить уровень".into()),
        )
    } else if input.github.is_some_and(|report| {
        report.index.confidence == SignalConfidence::Low && report.coverage.commits_analyzed < 30
    }) && input.stated_experience_months.is_none()
        && published.is_empty()
    {
        (
            None,
            Some("Публичных данных пока мало для оценки уровня".into()),
        )
    } else {
        (
            Some(cap_grade(band(score), experience_months.unwrap_or(0))),
            None,
        )
    };
    let confidence = confidence(input, &published, grade.is_some());
    let answers = answers(input.github, specialization, experience_months);
    ProfileEstimate {
        version: ESTIMATE_VERSION.into(),
        computed_at: input.now.into(),
        specialization,
        specializations,
        grade,
        score,
        confidence,
        factors,
        answers,
        sources,
        insufficient,
        review: None,
    }
}

/// Questionnaire fields an estimate may answer, by their contract names.
pub const AUTO_FIELDS: [&str; 7] = [
    "name",
    "specialization",
    "selectedGrade",
    "stack",
    "experienceMonths",
    "experience",
    "teamRole",
];

/// The name a new account starts with; an estimate may replace it.
pub const DEFAULT_CANDIDATE_NAME: &str = "Новый кандидат";

impl crate::CandidateProfile {
    /// The experience the candidate stated (typed or imported), not the one an estimate filled in.
    #[must_use]
    pub fn stated_experience_months(&self) -> Option<u32> {
        self.experience_months.filter(|_| {
            !self
                .auto_fields
                .iter()
                .any(|field| field == "experienceMonths")
        })
    }

    /// Stores the estimate and answers the questionnaire fields the candidate has not answered:
    /// empty ones, ones an earlier estimate filled, and the specialization and target grade while
    /// the questionnaire is incomplete. A field the candidate edits is never overwritten, and a
    /// test-confirmed category keeps its specialization and target grade.
    pub fn apply_estimate(&mut self, estimate: ProfileEstimate) {
        let incomplete = !self.questionnaire_complete();
        let confirmed = self.verified_grade.is_some();
        let auto =
            |profile: &Self, field: &str| profile.auto_fields.iter().any(|item| item == field);
        let mut filled = Vec::new();
        let answers = &estimate.answers;
        if let Some(name) = answers.name.as_ref().filter(|name| !name.trim().is_empty())
            && (auto(self, "name")
                || self.name.trim().is_empty()
                || self.name == DEFAULT_CANDIDATE_NAME)
        {
            self.name = name.trim().chars().take(120).collect();
            filled.push("name");
        }
        if let Some(specialization) = estimate.specialization
            && !confirmed
            && (auto(self, "specialization") || incomplete)
        {
            self.specialization = specialization;
            filled.push("specialization");
        }
        if let Some(grade) = estimate.grade
            && !confirmed
            && (auto(self, "selectedGrade") || incomplete)
        {
            self.selected_grade = grade;
            filled.push("selectedGrade");
        }
        if !answers.stack.is_empty() && (auto(self, "stack") || self.stack.is_empty()) {
            self.stack = answers.stack.clone();
            filled.push("stack");
        }
        if answers.experience_months.is_some()
            && (auto(self, "experienceMonths") || self.experience_months.is_none())
        {
            self.experience_months = answers.experience_months.map(|months| months.min(1200));
            filled.push("experienceMonths");
        }
        if !answers.experience.trim().is_empty()
            && (auto(self, "experience") || self.experience.trim().is_empty())
        {
            self.experience = answers.experience.chars().take(4000).collect();
            filled.push("experience");
        }
        if !answers.team_role.trim().is_empty()
            && (auto(self, "teamRole") || self.team_role.trim().is_empty())
        {
            self.team_role = answers.team_role.chars().take(120).collect();
            filled.push("teamRole");
        }
        for field in filled {
            if !auto(self, field) {
                self.auto_fields.push(field.to_owned());
            }
        }
        self.estimate = Some(estimate);
    }
}

/// Applies a validated LLM review: it may pick between the two leading specializations when they
/// are within ten points, take over the texts, and a disagreement on the grade lowers confidence.
pub fn apply_review(estimate: &mut ProfileEstimate, reply: ProfileReviewReply) {
    if let [first, second, ..] = estimate.specializations.as_slice()
        && first.percent.saturating_sub(second.percent) <= 10
        && (reply.specialization == first.id || reply.specialization == second.id)
    {
        estimate.specialization = Some(reply.specialization);
    }
    let agrees = estimate.grade == Some(reply.grade);
    if !agrees {
        estimate.confidence = lower(estimate.confidence);
    }
    if let Some(experience) = clean_text(&reply.experience, 1200) {
        estimate.answers.experience = experience;
    }
    if let Some(team_role) = clean_text(&reply.team_role, 120) {
        estimate.answers.team_role = team_role;
    }
    estimate.review = Some(EstimateReview {
        specialization: reply.specialization,
        grade: reply.grade,
        rationale: clean_text(&reply.rationale, 600).unwrap_or_default(),
        agrees,
    });
}

/// Model text for a profile: trimmed, bounded, single-spaced and free of links and addresses.
fn clean_text(value: &str, limit: usize) -> Option<String> {
    let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = text.to_lowercase();
    if text.is_empty()
        || ["://", "www.", "@", "github.com"]
            .iter()
            .any(|item| lower.contains(item))
    {
        return None;
    }
    Some(text.chars().take(limit).collect())
}

/// The anonymized evidence the LLM reviews.
#[must_use]
pub fn review_request(
    estimate: &ProfileEstimate,
    github: Option<&GitHubReport>,
    fsp: &[FspResult],
) -> ProfileReviewRequest {
    ProfileReviewRequest {
        summary: github.map_or_else(String::new, |report| report.profile.public_summary.clone()),
        specializations: estimate.specializations.clone(),
        rule_grade: estimate.grade,
        score: estimate.score,
        factors: estimate.factors.clone(),
        stack: estimate
            .answers
            .stack
            .iter()
            .map(|skill| crate::catalog::skill_label(skill).to_owned())
            .collect(),
        experience_months: estimate.answers.experience_months,
        fsp_results: fsp
            .iter()
            .filter(|result| result.status == "published")
            .map(|result| {
                format!(
                    "{}: {} место из {}",
                    result.discipline,
                    result
                        .place
                        .map_or_else(|| "—".to_owned(), |place| place.to_string()),
                    result.field_size
                )
            })
            .collect(),
    }
}

/// Seniority weights of the GitHub dimensions; volume and rhythm together stay at 20%.
const DIMENSION_WEIGHTS: [(GitHubDimensionId, &str, f64); 7] = [
    (GitHubDimensionId::Longevity, "Стаж публичной работы", 0.20),
    (GitHubDimensionId::Ownership, "Собственные проекты", 0.20),
    (GitHubDimensionId::Craft, "Инженерная культура", 0.15),
    (GitHubDimensionId::Collaboration, "Совместная работа", 0.15),
    (GitHubDimensionId::Impact, "Признание", 0.10),
    (GitHubDimensionId::Engagement, "Вовлечённость", 0.10),
    (GitHubDimensionId::Consistency, "Регулярность", 0.10),
];

const FSP_MAX: u8 = 15;

fn dimension_key(id: GitHubDimensionId) -> &'static str {
    match id {
        GitHubDimensionId::Consistency => "consistency",
        GitHubDimensionId::Engagement => "engagement",
        GitHubDimensionId::Longevity => "longevity",
        GitHubDimensionId::Collaboration => "collaboration",
        GitHubDimensionId::Ownership => "ownership",
        GitHubDimensionId::Craft => "craft",
        GitHubDimensionId::Impact => "impact",
    }
}

fn dimension(report: &GitHubReport, id: GitHubDimensionId) -> u8 {
    report
        .dimensions
        .iter()
        .find(|item| item.id == id)
        .map_or(0, |item| item.score)
}

fn ramp(value: f64, zero: f64, full: f64) -> f64 {
    ((value - zero) / (full - zero)).clamp(0.0, 1.0)
}

/// Grade bands of the seniority score.
fn band(score: u8) -> Grade {
    match score {
        0..=19 => Grade::Intern,
        20..=39 => Grade::Junior,
        40..=59 => Grade::Middle,
        60..=79 => Grade::Senior,
        _ => Grade::Lead,
    }
}

/// Senior needs two years of public work or stated experience, lead four. Months, not calendar
/// years: thirteen months across a new year are not two years of work.
fn cap_grade(grade: Grade, experience_months: u32) -> Grade {
    match grade {
        Grade::Lead if experience_months < 48 => cap_grade(Grade::Senior, experience_months),
        Grade::Senior if experience_months < 24 => Grade::Middle,
        other => other,
    }
}

fn lower(confidence: SignalConfidence) -> SignalConfidence {
    match confidence {
        SignalConfidence::High => SignalConfidence::Medium,
        _ => SignalConfidence::Low,
    }
}

fn confidence(
    input: &EstimateInput<'_>,
    published: &[&FspResult],
    graded: bool,
) -> SignalConfidence {
    if !graded {
        return SignalConfidence::Low;
    }
    match input.github {
        Some(report) => {
            let mut level = report.index.confidence;
            if report.coverage.partial {
                level = lower(level);
            }
            level
        }
        None if input.stated_experience_months.is_some() || published.len() >= 2 => {
            SignalConfidence::Medium
        }
        None => SignalConfidence::Low,
    }
}

/// Months of public work: from the first analyzed commit, or from the start of the first year with
/// sustained activity (ten active days) when GitHub search reaches further back, to the report date.
fn public_experience_months(report: &GitHubReport) -> Option<u32> {
    let month = |value: &str| -> Option<i64> {
        let year = value.get(0..4)?.parse::<i64>().ok()?;
        let month = value.get(5..7)?.parse::<i64>().ok()?;
        Some(year * 12 + month)
    };
    let first_sustained_year = report
        .activity
        .yearly
        .iter()
        .filter(|year| year.active_days >= 10)
        .map(|year| i64::from(year.year) * 12 + 1)
        .min();
    let start = match (month(&report.coverage.from), first_sustained_year) {
        (Some(analyzed), Some(searched)) => analyzed.min(searched),
        (analyzed, searched) => analyzed.or(searched)?,
    };
    let span = month(&report.coverage.to)? - start;
    (span > 0).then(|| u32::try_from(span).unwrap_or(0))
}

/// Up to fifteen points: the best placement share, a final, and repeated participation.
fn fsp_points(published: &[&FspResult]) -> u8 {
    if published.is_empty() {
        return 0;
    }
    let best = published
        .iter()
        .filter_map(|result| {
            let place = result.place?;
            (result.field_size > 0).then(|| f64::from(place) / f64::from(result.field_size))
        })
        .fold(f64::INFINITY, f64::min);
    let placement = if best <= 0.1 {
        10
    } else if best <= 0.25 {
        7
    } else if best.is_finite() {
        4
    } else {
        2
    };
    let repeated = if published.len() >= 3 {
        5
    } else if published.len() == 2 {
        3
    } else {
        1
    };
    (placement + repeated).min(FSP_MAX)
}

fn fsp_detail(published: &[&FspResult]) -> String {
    let best = published
        .iter()
        .filter_map(|result| result.place.map(|place| (place, result.field_size)))
        .min_by_key(|(place, _)| *place);
    match best {
        Some((place, size)) => format!(
            "Опубликованных результатов: {}; лучшее место — {} из {}",
            published.len(),
            place,
            size
        ),
        None => format!("Опубликованных результатов: {}", published.len()),
    }
}

/// Specialization shares from the candidate's areas of work, catalog indicators and FSP disciplines.
fn specialization_shares(
    github: Option<&GitHubReport>,
    published: &[&FspResult],
) -> Vec<SpecializationShare> {
    let mut scores: BTreeMap<Specialization, f64> = BTreeMap::new();
    if let Some(report) = github {
        let languages = report
            .languages
            .iter()
            .map(|item| (item.language.as_str(), f64::from(item.percent)))
            .collect::<BTreeMap<_, _>>();
        let share = |language: &str| languages.get(language).copied().unwrap_or(0.0);
        let mut areas: BTreeMap<Specialization, f64> = BTreeMap::new();
        for archetype in &report.profile.archetypes {
            let percent = f64::from(archetype.percent);
            let mut add = |id, weight: f64| *areas.entry(id).or_default() += percent * weight;
            match archetype.id {
                Archetype::Backend => add(Specialization::Backend, 1.0),
                Archetype::Frontend => add(Specialization::Frontend, 1.0),
                Archetype::Platform => {
                    add(Specialization::Devops, 0.8);
                    add(Specialization::Sysadmin, 0.2);
                }
                // Tools, libraries and CLIs without a web stack: system or backend engineering.
                Archetype::Systems => {
                    add(Specialization::Systems, 0.5);
                    add(Specialization::Backend, 0.5);
                }
                Archetype::Data => {
                    add(Specialization::DataScience, 0.6);
                    add(Specialization::DataEngineering, 0.4);
                }
                Archetype::Mobile => {
                    let swift = share("Swift") + share("Objective-C");
                    let kotlin = share("Kotlin");
                    let dart = share("Dart");
                    let total = (swift + kotlin + dart).max(1.0);
                    add(Specialization::Ios, swift / total);
                    add(Specialization::Android, kotlin / total);
                    add(
                        Specialization::MobileCrossplatform,
                        if swift + kotlin + dart == 0.0 {
                            1.0
                        } else {
                            dart / total
                        },
                    );
                }
            }
        }
        // Full stack when both backend and frontend carry a substantial share.
        let backend = areas.get(&Specialization::Backend).copied().unwrap_or(0.0);
        let frontend = areas.get(&Specialization::Frontend).copied().unwrap_or(0.0);
        if backend >= 25.0 && frontend >= 25.0 {
            areas.insert(Specialization::Fullstack, backend + frontend);
        }
        let indicators = indicator_shares(report);
        for specialization in Specialization::ALL {
            let area = areas.get(&specialization).copied().unwrap_or(0.0);
            let indicator = indicators.get(&specialization).copied().unwrap_or(0.0);
            let score = 0.6 * area + 0.4 * indicator;
            if score > 0.0 {
                *scores.entry(specialization).or_default() += score;
            }
        }
    }
    for result in published {
        let weight = 15.0;
        for specialization in discipline_specializations(&result.discipline) {
            *scores.entry(specialization).or_default() += weight;
        }
    }
    let total: f64 = scores.values().sum();
    if total <= 0.0 {
        return Vec::new();
    }
    let mut shares = scores
        .into_iter()
        .map(|(id, score)| SpecializationShare {
            id,
            percent: (score / total * 100.0).round() as u8,
        })
        .filter(|share| share.percent > 0)
        .collect::<Vec<_>>();
    shares.sort_by(|a, b| b.percent.cmp(&a.percent).then(a.id.cmp(&b.id)));
    shares.truncate(3);
    shares
}

/// Shares of catalog indicator evidence per specialization, 0–100 in total.
fn indicator_shares(report: &GitHubReport) -> BTreeMap<Specialization, f64> {
    let evidence = report
        .technologies
        .iter()
        .map(|item| {
            (
                item.skill_id.as_str(),
                (1.0 + f64::from(item.repositories)).ln(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut raw: BTreeMap<Specialization, f64> = BTreeMap::new();
    for info in &crate::catalog::catalog().specializations {
        let value: f64 = info
            .indicators
            .iter()
            .filter_map(|skill| evidence.get(skill.as_str()))
            .sum();
        // Broad specializations list many indicators; normalize by the square root of their count.
        if value > 0.0 {
            raw.insert(info.id, value / (info.indicators.len() as f64).sqrt());
        }
    }
    let total: f64 = raw.values().sum();
    if total <= 0.0 {
        return raw;
    }
    raw.into_iter()
        .map(|(id, value)| (id, value / total * 100.0))
        .collect()
}

fn discipline_specializations(discipline: &str) -> Vec<Specialization> {
    let lower = discipline.to_lowercase();
    if lower.contains("продукт") {
        vec![Specialization::Fullstack, Specialization::Backend]
    } else if lower.contains("безопас") {
        vec![Specialization::Security]
    } else if lower.contains("робот") || lower.contains("беспилот") || lower.contains("бас")
    {
        vec![Specialization::Embedded]
    } else if lower.contains("алгоритм") {
        vec![Specialization::Backend, Specialization::Systems]
    } else {
        Vec::new()
    }
}

/// Questionnaire answers: the strongest catalog skills, experience and role.
fn answers(
    github: Option<&GitHubReport>,
    specialization: Option<Specialization>,
    experience_months: Option<u32>,
) -> EstimateAnswers {
    let mut stack = Vec::new();
    let mut team_role = String::new();
    let mut experience = String::new();
    let mut name = None;
    if let Some(report) = github {
        // Languages the candidate writes most, then the technologies used across most projects.
        for language in report.languages.iter().filter(|item| item.percent >= 5) {
            if let Some(skill) = language_skill(&language.language)
                && !stack.contains(&skill.to_owned())
            {
                stack.push(skill.to_owned());
            }
        }
        let mut technologies = report
            .technologies
            .iter()
            .filter(|item| crate::catalog::is_skill(&item.skill_id))
            .collect::<Vec<_>>();
        technologies.sort_by(|a, b| {
            b.repositories
                .cmp(&a.repositories)
                .then(a.skill_id.cmp(&b.skill_id))
        });
        for item in technologies {
            if stack.len() >= STACK_LIMIT {
                break;
            }
            if !stack.contains(&item.skill_id) {
                stack.push(item.skill_id.clone());
            }
        }
        stack.truncate(STACK_LIMIT);
        experience = report.profile.summary.clone();
        let projects = report
            .profile
            .top_projects
            .iter()
            .take(3)
            .map(|project| {
                let name = project.name_with_owner.as_str();
                name.rsplit_once('/')
                    .map_or(name, |(_, repository)| repository)
            })
            .collect::<Vec<_>>();
        if !projects.is_empty() {
            experience.push_str(&format!(" Главные проекты: {}.", projects.join(", ")));
        }
        let ownership = &report.ownership;
        let collaboration = &report.collaboration;
        team_role = if ownership.led_repositories >= 5 && ownership.own_organizations >= 1 {
            "Ведёт собственные проекты и организации".into()
        } else if collaboration.external_merged >= 10 || collaboration.reviews_of_others >= 20 {
            "Командная разработка, ревью и вклад в открытые проекты".into()
        } else if ownership.led_repositories >= 1 {
            "Самостоятельно ведёт проекты".into()
        } else {
            String::new()
        };
        name = report.display_name.clone();
    }
    if team_role.is_empty() {
        team_role = specialization
            .map(|item| crate::catalog::specialization(item).role.clone())
            .unwrap_or_default();
    }
    EstimateAnswers {
        stack,
        experience_months,
        experience,
        team_role,
        name,
    }
}

fn language_skill(language: &str) -> Option<&'static str> {
    Some(match language {
        "Python" => "python",
        "Java" => "java",
        "JavaScript" => "javascript",
        "TypeScript" => "typescript",
        "C#" => "csharp",
        "C++" => "cpp",
        "C" => "c",
        "Go" => "go",
        "Rust" => "rust",
        "Kotlin" => "kotlin",
        "Swift" => "swift",
        "PHP" => "php",
        "Ruby" => "ruby",
        "Scala" => "scala",
        "Dart" => "dart",
        "1C Enterprise" => "onec_language",
        "ABAP" => "abap",
        "Delphi" => "delphi",
        "SQL" => "sql",
        "Shell" => "bash",
        "PowerShell" => "powershell",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report() -> GitHubReport {
        serde_json::from_str(include_str!(
            "../../../../contracts/fixtures/github-report.json"
        ))
        .unwrap()
    }

    fn fsp(discipline: &str, place: u32, size: u32) -> FspResult {
        FspResult {
            competition_id: format!("competition-{place}"),
            competition_name: "Демо".into(),
            discipline: discipline.into(),
            starts_at: "2026-03-01".into(),
            ends_at: "2026-03-02".into(),
            scope: "individual".into(),
            team_name: None,
            team_size: None,
            status: "published".into(),
            place: Some(place),
            field_size: size,
            score: Some(100),
            protocol_reference: None,
            published_at: Some("2026-03-03".into()),
            synthetic: true,
        }
    }

    fn input<'a>(github: Option<&'a GitHubReport>, fsp: &'a [FspResult]) -> EstimateInput<'a> {
        EstimateInput {
            github,
            fsp,
            stated_experience_months: None,
            now: "2026-10-10T00:00:00Z",
        }
    }

    #[test]
    fn a_github_report_gives_a_specialization_grade_and_answers() {
        let report = report();
        let estimate = estimate_profile(&input(Some(&report), &[]));
        assert_eq!(estimate.version, ESTIMATE_VERSION);
        assert_eq!(estimate.specialization, Some(Specialization::Backend));
        assert!(estimate.grade.is_some());
        assert_eq!(estimate.factors.len(), 7);
        assert_eq!(
            estimate
                .factors
                .iter()
                .map(|factor| u32::from(factor.max))
                .sum::<u32>(),
            100
        );
        assert!(estimate.answers.stack.contains(&"rust".to_owned()));
        assert!(estimate.answers.stack.len() <= STACK_LIMIT);
        assert!(
            estimate
                .answers
                .stack
                .iter()
                .all(|skill| crate::catalog::is_skill(skill))
        );
        assert!(!estimate.answers.experience.is_empty());
        assert!(!estimate.answers.team_role.is_empty());
        assert_eq!(estimate.sources, ["github"]);
        assert_eq!(
            estimate,
            estimate_profile(&input(Some(&report), &[])),
            "deterministic"
        );
    }

    #[test]
    fn without_evidence_there_is_no_grade() {
        let estimate = estimate_profile(&input(None, &[]));
        assert_eq!(estimate.grade, None);
        assert_eq!(estimate.specialization, None);
        assert_eq!(estimate.confidence, SignalConfidence::Low);
        assert!(estimate.insufficient.is_some());
    }

    #[test]
    fn fsp_results_alone_name_a_specialization_and_a_modest_grade() {
        let results = [
            fsp("Программирование систем информационной безопасности", 2, 40),
            fsp("Программирование систем информационной безопасности", 5, 60),
        ];
        let estimate = estimate_profile(&input(None, &results));
        assert_eq!(estimate.specialization, Some(Specialization::Security));
        assert_eq!(estimate.grade, Some(Grade::Junior));
        assert_eq!(estimate.score, 26);
        assert_eq!(estimate.confidence, SignalConfidence::Medium);
        assert_eq!(estimate.sources, ["fsp"]);
        let fsp_factor = estimate
            .factors
            .iter()
            .find(|factor| factor.id == "fsp")
            .unwrap();
        assert_eq!(fsp_factor.points, 13);
    }

    #[test]
    fn volume_without_years_never_reaches_senior() {
        let mut report = report();
        for dimension in &mut report.dimensions {
            dimension.score = 100;
        }
        // Thirteen months across two calendar years are not two years of work.
        report.activity.active_years = 2;
        report.activity.yearly.retain(|year| year.year >= 2025);
        report.coverage.from = "2025-09-01T00:00:00Z".into();
        report.coverage.to = "2026-10-01T00:00:00Z".into();
        for year in &mut report.activity.yearly {
            year.active_days = 9;
        }
        let estimate = estimate_profile(&input(Some(&report), &[]));
        assert_eq!(estimate.score, 100);
        assert_eq!(estimate.grade, Some(Grade::Middle));
        // Sustained activity found by search reaches back further than the analyzed commits.
        report.activity.yearly.push(crate::GitHubYear {
            year: 2021,
            commits: 300,
            active_days: 120,
            pull_requests: None,
        });
        let estimate = estimate_profile(&input(Some(&report), &[]));
        assert_eq!(estimate.answers.experience_months, Some(69));
        assert_eq!(estimate.grade, Some(Grade::Lead));
    }

    #[test]
    fn stated_experience_counts_private_work() {
        let mut stated = input(None, &[]);
        stated.stated_experience_months = Some(72);
        let estimate = estimate_profile(&stated);
        assert_eq!(estimate.grade, Some(Grade::Junior));
        assert_eq!(estimate.answers.experience_months, Some(72));
        assert_eq!(estimate.confidence, SignalConfidence::Medium);
    }

    #[test]
    fn a_review_picks_between_close_specializations_and_lowers_confidence_on_disagreement() {
        let report = report();
        let mut estimate = estimate_profile(&input(Some(&report), &[]));
        estimate.specializations = vec![
            SpecializationShare {
                id: Specialization::Backend,
                percent: 45,
            },
            SpecializationShare {
                id: Specialization::Devops,
                percent: 40,
            },
        ];
        estimate.confidence = SignalConfidence::High;
        let rule_grade = estimate.grade.unwrap();
        let other = if rule_grade == Grade::Lead {
            Grade::Senior
        } else {
            Grade::Lead
        };
        apply_review(
            &mut estimate,
            ProfileReviewReply {
                specialization: Specialization::Devops,
                grade: other,
                rationale: "Основная работа — платформа и CI".into(),
                experience: "Строит платформу и автоматизацию.".into(),
                team_role: "Ведёт инфраструктуру".into(),
            },
        );
        assert_eq!(estimate.specialization, Some(Specialization::Devops));
        assert_eq!(
            estimate.grade,
            Some(rule_grade),
            "the grade stays rule-based"
        );
        assert_eq!(estimate.confidence, SignalConfidence::Medium);
        assert!(!estimate.review.as_ref().unwrap().agrees);
        assert_eq!(estimate.answers.team_role, "Ведёт инфраструктуру");
        // A far specialization is not taken.
        apply_review(
            &mut estimate,
            ProfileReviewReply {
                specialization: Specialization::Design,
                grade: rule_grade,
                rationale: String::new(),
                experience: String::new(),
                team_role: String::new(),
            },
        );
        assert_eq!(estimate.specialization, Some(Specialization::Devops));
        // Texts with links or addresses are dropped; the earlier ones stay.
        apply_review(
            &mut estimate,
            ProfileReviewReply {
                specialization: Specialization::Devops,
                grade: rule_grade,
                rationale: "См. https://example.test".into(),
                experience: "Пишите на mail@example.test".into(),
                team_role: "  Ведёт\n платформу  ".into(),
            },
        );
        assert_eq!(
            estimate.answers.experience,
            "Строит платформу и автоматизацию."
        );
        assert_eq!(estimate.answers.team_role, "Ведёт платформу");
        assert_eq!(estimate.review.as_ref().unwrap().rationale, "");
    }

    fn new_profile() -> crate::CandidateProfile {
        crate::CandidateProfile {
            id: "candidate-1".into(),
            alias: "Кандидат №001".into(),
            email: "new@example.test".into(),
            name: DEFAULT_CANDIDATE_NAME.into(),
            specialization: Specialization::Backend,
            selected_grade: Grade::Junior,
            stack: Vec::new(),
            team_role: String::new(),
            experience_months: None,
            experience: String::new(),
            soft_skills: Vec::new(),
            consents: crate::Consents {
                processing: true,
                publication: false,
            },
            verified_grade: None,
            verified_specialization: None,
            grade_confirmed_at: None,
            estimate: None,
            auto_fields: Vec::new(),
            revision: 1,
            updated_at: "2026-10-10T00:00:00Z".into(),
        }
    }

    #[test]
    fn an_estimate_answers_a_new_profile_and_keeps_what_the_candidate_edited() {
        let report = report();
        let mut estimate = estimate_profile(&input(Some(&report), &[]));
        estimate.specialization = Some(Specialization::Devops);
        estimate.grade = Some(Grade::Middle);
        let mut profile = new_profile();
        profile.apply_estimate(estimate.clone());
        assert!(profile.questionnaire_complete());
        assert_eq!(profile.specialization, Specialization::Devops);
        assert_eq!(profile.selected_grade, Grade::Middle);
        assert_eq!(profile.stack, estimate.answers.stack);
        assert_eq!(profile.auto_fields.len(), AUTO_FIELDS.len());
        assert_eq!(profile.stated_experience_months(), None);

        // The candidate's own answer stays; auto answers follow the next estimate.
        profile.team_role = "Тимлид".into();
        profile.auto_fields.retain(|field| field != "teamRole");
        estimate.grade = Some(Grade::Senior);
        profile.apply_estimate(estimate.clone());
        assert_eq!(profile.team_role, "Тимлид");
        assert_eq!(profile.selected_grade, Grade::Senior);

        // A test-confirmed category keeps its specialization and target grade.
        profile.verified_grade = Some(Grade::Lead);
        profile.verified_specialization = Some(Specialization::Devops);
        profile.selected_grade = Grade::Lead;
        estimate.specialization = Some(Specialization::Frontend);
        profile.apply_estimate(estimate);
        assert_eq!(profile.specialization, Specialization::Devops);
        assert_eq!(profile.selected_grade, Grade::Lead);
    }

    #[test]
    fn the_review_request_carries_no_names_or_links() {
        let report = report();
        let estimate = estimate_profile(&input(Some(&report), &[]));
        let request =
            serde_json::to_string(&review_request(&estimate, Some(&report), &[])).unwrap();
        for private in ["owner/", "acme-labs", "github.com", "Иван"] {
            assert!(!request.contains(private), "{private}");
        }
    }
}
