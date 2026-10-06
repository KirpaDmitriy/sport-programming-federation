use fsp_application::{FspGateway, IntegrationError};
use fsp_domain::FspParticipation;

pub struct SyntheticFsp;

impl FspGateway for SyntheticFsp {
    fn participation(&self, account: &str) -> Result<FspParticipation, IntegrationError> {
        let normalized = account.trim();
        if normalized.is_empty() {
            return Err(IntegrationError {
                code: "fsp_account_invalid",
                message: "Укажите идентификатор участника ФСП".into(),
            });
        }
        // The synthetic FSP dataset recognizes the two demo participants the
        // mock verifies; every other account is an unverified link.
        let verified = matches!(normalized, "FSP-DEMO-024" | "FSP-DEMO-031");
        Ok(FspParticipation {
            account_label: normalized.into(),
            verified,
            competition_ids: if verified {
                vec!["competition-demo-api".into()]
            } else {
                Vec::new()
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_the_demo_account_and_rejects_an_empty_identifier() {
        let gateway = SyntheticFsp;
        let participation = gateway.participation("  FSP-DEMO-024  ").unwrap();
        assert_eq!(participation.account_label, "FSP-DEMO-024");
        assert!(participation.verified);
        assert_eq!(participation.competition_ids, ["competition-demo-api"]);

        let unknown = gateway.participation("fsp-024").unwrap();
        assert!(!unknown.verified);
        assert!(unknown.competition_ids.is_empty());

        let error = gateway.participation("  ").unwrap_err();
        assert_eq!(error.code, "fsp_account_invalid");
    }
}
