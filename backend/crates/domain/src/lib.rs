//! Domain model of the reverse-hiring platform: pure types and rules with no I/O and no framework.
//! The vocabulary follows `contracts/openapi.json`; the rules follow `docs/product/BUSINESS_RULES.md`.

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
}
