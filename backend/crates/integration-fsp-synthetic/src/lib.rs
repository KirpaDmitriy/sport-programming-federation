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
        Ok(FspParticipation {
            account_label: normalized.into(),
            verified: true,
            competition_ids: vec!["competition-demo-api".into()],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_the_demo_account_and_rejects_an_empty_identifier() {
        let gateway = SyntheticFsp;
        let participation = gateway.participation("  fsp-024  ").unwrap();
        assert_eq!(participation.account_label, "fsp-024");
        assert!(participation.verified);

        let error = gateway.participation("  ").unwrap_err();
        assert_eq!(error.code, "fsp_account_invalid");
    }
}
