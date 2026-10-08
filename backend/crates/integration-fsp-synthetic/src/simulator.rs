use crate::{ParticipantResults, valid_account};
use axum::{Json, Router, extract::Path, http::StatusCode, routing::get};
use fsp_domain::FspResult;

pub fn router() -> Router {
    Router::new()
        .route("/health", get(|| async { Json(serde_json::json!({"status":"ok", "service":"fsp-simulator", "version":"fsp-demo-v1", "synthetic":true})) }))
        .route("/v1/participants/{id}/results", get(|Path(id): Path<String>| async move {
            if !valid_account(&id) { return Err(StatusCode::BAD_REQUEST); }
            Ok(Json(fixture(&id)))
        }))
}

pub(crate) fn fixture(account: &str) -> ParticipantResults {
    let mut results = Vec::new();
    if matches!(
        account,
        "FSP-DEMO-024" | "FSP-DEMO-031" | "FSP-DEMO-PENDING" | "FSP-DEMO-DQ"
    ) {
        let pending = account == "FSP-DEMO-PENDING";
        let disqualified = account == "FSP-DEMO-DQ";
        let published = !pending && !disqualified;
        results.push(FspResult {
            competition_id: "competition-demo-api".into(),
            competition_name: "Учебный кубок API 2026 (вымышленное событие)".into(),
            discipline: "Продуктовое программирование".into(),
            starts_at: "2026-09-20T09:00:00Z".into(),
            ends_at: "2026-09-21T18:00:00Z".into(),
            scope: "team".into(),
            team_name: Some("Команда Пример".into()),
            team_size: Some(4),
            status: if pending {
                "pending"
            } else if disqualified {
                "disqualified"
            } else {
                "published"
            }
            .into(),
            place: published.then_some(3),
            field_size: 18,
            score: published.then_some(82),
            protocol_reference: (!pending).then(|| "DEMO-PROTOCOL-API-2026-01".into()),
            published_at: (!pending).then(|| "2026-09-22T12:00:00Z".into()),
            synthetic: true,
        });
        if account == "FSP-DEMO-031" {
            results.push(FspResult {
                competition_id: "competition-demo-algorithms".into(),
                competition_name: "Учебный алгоритмический турнир (вымышленное событие)".into(),
                discipline: "Алгоритмическое программирование".into(),
                starts_at: "2026-09-24T09:00:00Z".into(),
                ends_at: "2026-09-24T14:00:00Z".into(),
                scope: "individual".into(),
                team_name: None,
                team_size: None,
                status: "pending".into(),
                place: None,
                field_size: 48,
                score: None,
                protocol_reference: None,
                published_at: None,
                synthetic: true,
            });
        }
    }
    ParticipantResults {
        version: "fsp-demo-v1".into(),
        synthetic: true,
        participant_id: account.into(),
        registered: account == "FSP-DEMO-EMPTY" || !results.is_empty(),
        results,
    }
}
