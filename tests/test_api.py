from fastapi.testclient import TestClient

from app.main import create_app
from app.infrastructure.seed import FSP_DEMO_PAYLOAD


def client(tmp_path):
    return TestClient(create_app(tmp_path / "api.sqlite3"))


def test_health_catalog_and_ranked_matches(tmp_path) -> None:
    with client(tmp_path) as http:
        assert http.get("/api/v1/health").json() == {"status": "ok", "service": "kodrazryad", "offline": True}
        catalog = http.get("/api/v1/catalog").json()
        matches = http.get("/api/v1/vacancies/ml-engineer/matches").json()

    assert len(catalog["skills"]) == 10
    assert len(matches) == 5
    assert matches[0]["match"]["score"] >= matches[-1]["match"]["score"]
    assert "gaps" in matches[0]["match"]


def test_browser_shell_and_assets_are_served(tmp_path) -> None:
    with client(tmp_path) as http:
        page = http.get("/")
        script = http.get("/assets/app.js")
        styles = http.get("/assets/styles.css")

    assert page.status_code == 200
    assert "Ищите доказательства" in page.text
    assert "КодРазряд — таланты с доказательствами" in page.text
    assert "Демо · контракт ФСП" in page.text
    assert 'id="requirement-builder"' in page.text
    assert 'id="competition-policy"' in page.text
    assert 'id="data-dialog"' in page.text
    assert "async function boot" in script.text
    assert "prefers-reduced-motion" in styles.text
    assert "max-width: 420px" in styles.text


def test_candidate_graph_and_recommendations(tmp_path) -> None:
    with client(tmp_path) as http:
        complete_response = http.get("/api/v1/candidates/alina?vacancy_id=ml-engineer")
        response = http.get("/api/v1/candidates/maksim?vacancy_id=ml-engineer")

    assert response.status_code == 200
    body = response.json()
    assert body["graph"]["nodes"]
    assert body["evidence"][0]["competition"]
    assert "match" in body
    assert complete_response.json()["recommendations"] == []
    assert body["recommendations"][0]["competition_id"] == "ml-challenge-2027"


def test_create_vacancy_and_offer_end_to_end(tmp_path) -> None:
    vacancy = {
        "id": "python-intern",
        "employer": "КодРазряд Лаб",
        "title": "Python-разработчик",
        "grade": "Junior",
        "work_format": "remote",
        "salary_from": 120000,
        "salary_to": 170000,
        "requirements": [
            {"skill_id": "python", "level": 0.5, "criticality": 5},
            {"skill_id": "algorithms", "level": 0.4, "criticality": 3},
        ],
        "evidence_policy": {
            "mode": "allowlist",
            "competition_ids": ["fsp-algo-final-2026"],
        },
    }
    with client(tmp_path) as http:
        assert http.post("/api/v1/vacancies", json=vacancy).status_code == 201
        offer = http.post(
            "/api/v1/offers",
            json={
                "candidate_id": "alina",
                "vacancy_id": "python-intern",
                "salary_from": 140000,
                "salary_to": 170000,
                "message": "Алина, приглашаем обсудить нашу платформу.",
            },
        )
        inbox = http.get("/api/v1/candidates/alina/offers")

    assert offer.status_code == 201
    assert inbox.json()[0]["title"] == "Python-разработчик"


def test_validation_and_not_found_paths_can_fail(tmp_path) -> None:
    malformed = {
        "id": "bad",
        "employer": "X",
        "title": "Bad",
        "grade": "M",
        "work_format": "remote",
        "salary_from": 200000,
        "salary_to": 100000,
        "requirements": [{"skill_id": "unknown", "level": 2, "criticality": 7}],
    }
    with client(tmp_path) as http:
        assert http.post("/api/v1/vacancies", json=malformed).status_code == 422
        assert http.get("/api/v1/candidates/missing").status_code == 404
        assert http.get("/api/v1/candidates/alina?vacancy_id=missing").status_code == 404
        assert http.get("/api/v1/vacancies/missing/matches").status_code == 404


def test_openapi_contains_fsp_contract(tmp_path) -> None:
    with client(tmp_path) as http:
        schema = http.get("/openapi.json").json()

    sync = schema["paths"]["/api/v1/integrations/fsp/sync"]["post"]
    names = schema["components"]["schemas"]
    assert "FspPayloadIn" in names
    assert sync["tags"] == ["integrations"]


def test_fsp_sync_rejects_broken_references_without_partial_write(tmp_path) -> None:
    payload = {**FSP_DEMO_PAYLOAD, "results": [{**FSP_DEMO_PAYLOAD["results"][0], "participant_id": "missing"}]}
    with client(tmp_path) as http:
        before = len(http.get("/api/v1/candidates").json())
        response = http.post("/api/v1/integrations/fsp/sync", json=payload)
        after = len(http.get("/api/v1/candidates").json())

    assert response.status_code == 422
    assert "Unknown participant" in response.json()["detail"]
    assert after == before
