//! Pure domain types and rules for the reverse-hiring platform.

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

impl CandidateProfile {
    #[must_use]
    pub fn questionnaire_complete(&self) -> bool {
        !self.name.trim().is_empty() && !self.stack.is_empty() && !self.team_role.trim().is_empty()
    }

    #[must_use]
    pub fn visible_to_employers(&self) -> bool {
        self.questionnaire_complete()
            && self.verified_grade.is_some()
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
            experience: String::new(),
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
        assert!(profile.visible_to_employers());
        profile.consents.publication = false;
        assert!(!profile.visible_to_employers());
    }
}
