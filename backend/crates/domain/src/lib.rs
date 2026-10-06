//! Pure domain types and rules for the reverse-hiring platform.

mod llm;
mod matching;
mod sources;

pub use llm::*;
pub use matching::*;
pub use sources::*;

use serde::{Deserialize, Serialize};

/// Assessed level. The order is meaningful: a verified grade never goes down, and a need's grade is a
/// minimum the candidate's verified grade has to reach.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grade {
    Junior,
    Middle,
    Senior,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Specialization {
    Backend,
    Frontend,
    Fullstack,
}

/// An account has exactly one role, fixed at registration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Candidate,
    Employer,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub role: Role,
    pub candidate_id: Option<String>,
    pub company_id: Option<String>,
    pub email_verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Consents {
    pub processing: bool,
    pub publication: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateProfile {
    pub id: String,
    pub alias: String,
    pub email: String,
    pub name: String,
    pub specialization: Specialization,
    pub selected_grade: Grade,
    pub stack: Vec<String>,
    pub team_role: String,
    pub experience_months: Option<u32>,
    pub experience: String,
    pub soft_skills: Vec<String>,
    pub consents: Consents,
    pub verified_grade: Option<Grade>,
    pub verified_specialization: Option<Specialization>,
    pub grade_confirmed_at: Option<String>,
    pub revision: u64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateIndexRecord {
    pub profile: CandidateProfile,
    pub email_verified: bool,
    pub work_modes: Vec<String>,
    pub available_for_offers: bool,
    pub skills: Vec<SkillEvidence>,
    pub source_kinds: Vec<EvidenceSource>,
    pub fsp_verified: bool,
    pub last_signal_at: Option<String>,
}

impl CandidateIndexRecord {
    #[must_use]
    pub fn rankable(&self) -> Option<RankableCandidate> {
        Some(RankableCandidate {
            id: self.profile.id.clone(),
            specialization: self.profile.verified_specialization?,
            verified_grade: self.profile.verified_grade?,
            fsp_verified: self.fsp_verified,
            skills: self.skills.clone(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HiringNeedRecord {
    pub id: String,
    pub company_id: String,
    pub title: String,
    pub need: HiringNeed,
    pub work_mode: String,
    pub salary_from: u64,
    pub salary_to: u64,
    pub description: String,
    pub published: bool,
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub revision: u64,
}

impl CandidateProfile {
    #[must_use]
    pub fn questionnaire_complete(&self) -> bool {
        !self.name.trim().is_empty()
            && !self.stack.is_empty()
            && !self.team_role.trim().is_empty()
            && !self.experience.trim().is_empty()
    }

    /// Mirrors the mock's `onboarding.visibleToEmployers`: verified e-mail,
    /// complete questionnaire, a passed assessment (grade and specialization)
    /// and both consents.
    #[must_use]
    pub fn visible_to_employers(&self, email_verified: bool) -> bool {
        email_verified
            && self.questionnaire_complete()
            && self.verified_grade.is_some()
            && self.verified_specialization.is_some()
            && self.consents.processing
            && self.consents.publication
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Company {
    pub id: String,
    pub display_name: String,
    pub business_area: String,
    pub description: String,
    pub contact_email: String,
    pub website: Option<String>,
}

/// An employer's shortlist of candidate ids, in insertion order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShortlistRecord {
    pub id: String,
    pub company_id: String,
    pub title: String,
    pub member_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Lifecycle shared by employer invitations and candidate applications.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InteractionStatus {
    Sent,
    Viewed,
    Accepted,
    Declined,
    Withdrawn,
}

impl InteractionStatus {
    /// Terminal states cannot transition further; re-issuing the same
    /// terminal outcome is the caller's idempotent replay.
    #[must_use]
    pub fn terminal(self) -> bool {
        matches!(self, Self::Accepted | Self::Declined | Self::Withdrawn)
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sent => "sent",
            Self::Viewed => "viewed",
            Self::Accepted => "accepted",
            Self::Declined => "declined",
            Self::Withdrawn => "withdrawn",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "sent" => Some(Self::Sent),
            "viewed" => Some(Self::Viewed),
            "accepted" => Some(Self::Accepted),
            "declined" => Some(Self::Declined),
            "withdrawn" => Some(Self::Withdrawn),
            _ => None,
        }
    }
}

/// The company card frozen into an invitation or application snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyCard {
    pub id: String,
    pub display_name: String,
    pub business_area: String,
    pub description: String,
    pub contact_email: String,
}

/// The need fields frozen into an invitation snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeedSnapshot {
    pub id: String,
    pub title: String,
    pub work_mode: String,
    pub salary_from: u64,
    pub salary_to: u64,
    pub description: String,
}

/// An employer's invitation to a candidate, with the company card and the
/// need frozen at creation so later edits do not rewrite sent terms.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvitationRecord {
    pub id: String,
    pub company_id: String,
    pub candidate_id: String,
    pub candidate_alias: String,
    pub company: CompanyCard,
    pub need: NeedSnapshot,
    pub need_definition: HiringNeedRecord,
    pub message: String,
    pub status: InteractionStatus,
    pub created_at: String,
    pub viewed_at: Option<String>,
    pub responded_at: Option<String>,
    pub disclosure_fields: Vec<String>,
}

/// The vacancy fields frozen into an application snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancySnapshot {
    pub id: String,
    pub title: String,
    pub specialization: Specialization,
    pub grade: Grade,
    pub work_mode: String,
    pub salary_from: u64,
    pub salary_to: u64,
    pub description: String,
}

/// A candidate's application to a published need, with the company card,
/// the vacancy card and the full need frozen at submission time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationRecord {
    pub id: String,
    pub company_id: String,
    pub candidate_id: String,
    pub candidate_alias: String,
    pub company: CompanyCard,
    pub vacancy: VacancySnapshot,
    pub need_definition: HiringNeedRecord,
    pub message: String,
    pub status: InteractionStatus,
    pub created_at: String,
    pub viewed_at: Option<String>,
    pub responded_at: Option<String>,
    pub disclosure_fields: Vec<String>,
}

/// The aggregated disclosure grant a company holds over a candidate.
/// Row existence means `granted: true`; an absent row renders the
/// not-granted disclosure shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DisclosureRecord {
    pub candidate_id: String,
    pub company_id: String,
    pub invitation_id: Option<String>,
    pub application_id: Option<String>,
    pub granted_at: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub source_links: Vec<String>,
}

impl Company {
    #[must_use]
    pub fn ready_to_invite(&self) -> bool {
        !self.display_name.trim().is_empty()
            && !self.business_area.trim().is_empty()
            && !self.description.trim().is_empty()
            && !self.contact_email.trim().is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grades_are_ordered_from_junior_to_senior() {
        assert!(Grade::Junior < Grade::Middle);
        assert!(Grade::Middle < Grade::Senior);
    }

    #[test]
    fn wire_names_match_the_contract() {
        let names =
            serde_json::to_value((Grade::Middle, Specialization::Fullstack, Role::Employer))
                .unwrap();
        assert_eq!(
            names,
            serde_json::json!(["middle", "fullstack", "employer"])
        );
    }

    #[test]
    fn publication_requires_a_complete_verified_profile_and_both_consents() {
        let mut profile = CandidateProfile {
            id: "candidate-1".into(),
            alias: "Кандидат №001".into(),
            email: "candidate@example.test".into(),
            name: "Кандидат".into(),
            specialization: Specialization::Backend,
            selected_grade: Grade::Junior,
            stack: vec!["rust".into()],
            team_role: "Разработчик".into(),
            experience_months: Some(12),
            experience: "Два года в продуктовой разработке".into(),
            soft_skills: Vec::new(),
            consents: Consents {
                processing: true,
                publication: true,
            },
            verified_grade: Some(Grade::Junior),
            verified_specialization: Some(Specialization::Backend),
            grade_confirmed_at: None,
            revision: 1,
            updated_at: "2026-10-06T00:00:00Z".into(),
        };
        assert!(profile.visible_to_employers(true));
        assert!(!profile.visible_to_employers(false));
        profile.consents.publication = false;
        assert!(!profile.visible_to_employers(true));
    }
}
