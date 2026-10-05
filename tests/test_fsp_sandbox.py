from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import authenticated_client, candidate_profile


def _authorize(http: TestClient, participant_id: str = "FSP-2026-1042") -> tuple[str, str]:
    started = http.post("/api/v1/integrations/fsp/connect/start")
    assert started.status_code == 200
    authorize_url = started.json()["authorize_url"]
    request_token = parse_qs(urlparse(authorize_url).query)["request_token"][0]
    page = http.get(authorize_url)
    assert page.status_code == 200
    assert "синтетический стенд" in page.text
    authorized = http.post(
        "/fsp-id/oauth/authorize",
        json={
            "request_token": request_token,
            "participant_id": participant_id,
            "pin": participant_id.rsplit("-", 1)[1],
        },
    )
    assert authorized.status_code == 200
    callback = authorized.json()["redirect_to"]
    query = parse_qs(urlparse(callback).query)
    return query["code"][0], query["state"][0]


def test_fsp_id_connection_imports_results_once_and_rejects_code_reuse(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "fsp-sandbox.sqlite3")) as http:
        authenticated_client(http, "fsp-candidate@example.test", "candidate", "Кандидат ФСП")
        candidate_profile(http)
        profile = http.get("/api/v1/account/profile").json()["profile"]
        candidate_id = profile["candidate_id"]

        code, state = _authorize(http)
        callback = http.get(
            "/api/v1/integrations/fsp/connect/callback",
            params={"code": code, "state": state},
            follow_redirects=False,
        )
        assert callback.status_code == 303
        assert callback.headers["location"] == "/?fsp=connected"
        connected_profile = http.get("/api/v1/account/profile").json()["profile"]
        first_detail = http.get(f"/api/v1/candidates/{candidate_id}").json()

        reused = http.get(
            "/api/v1/integrations/fsp/connect/callback",
            params={"code": code, "state": state},
            follow_redirects=False,
        )
        assert reused.status_code == 400

        second_code, second_state = _authorize(http)
        assert http.get(
            "/api/v1/integrations/fsp/connect/callback",
            params={"code": second_code, "state": second_state},
            follow_redirects=False,
        ).status_code == 303
        second_detail = http.get(f"/api/v1/candidates/{candidate_id}").json()

    assert connected_profile["fsp_id"] == "FSP-2026-1042"
    assert first_detail["has_fsp_history"] is True
    assert len(first_detail["evidence"]) == 1
    assert first_detail["evidence"][0]["external_id"] == "sandbox-1042-data"
    assert len(second_detail["evidence"]) == 1


def test_fsp_connection_requires_candidate_profile_and_matching_session(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "fsp-boundary.sqlite3")) as owner:
        authenticated_client(owner, "owner@example.test", "candidate")
        assert owner.post("/api/v1/integrations/fsp/connect/start").status_code == 409
        candidate_profile(owner)
        code, state = _authorize(owner, "FSP-2026-2087")

        with TestClient(owner.app) as stranger:
            authenticated_client(stranger, "stranger@example.test", "candidate")
            candidate_profile(stranger)
            response = stranger.get(
                "/api/v1/integrations/fsp/connect/callback",
                params={"code": code, "state": state},
                follow_redirects=False,
            )

    assert response.status_code == 400
