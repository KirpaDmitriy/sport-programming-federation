from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import authenticated_client, employer_profile


def test_employer_can_build_vacancy_graph_draft_offline(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "draft.sqlite3")) as http:
        authenticated_client(http, "employer-graph@example.test", "employer")
        employer_profile(http)

        response = http.post(
            "/api/v1/graph/vacancy-draft",
            json={"text": "Нужны решающие деревья и случайные леса. Python будет плюсом для команды."},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "offline_rules"
    assert {item["skill_id"] for item in body["requirements"]} == {
        "decision-trees", "random-forests", "python",
    }


def test_vacancy_draft_requires_employer_role(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "draft-auth.sqlite3")) as http:
        response = http.post(
            "/api/v1/graph/vacancy-draft",
            json={"text": "Нужны решающие деревья и случайные леса."},
        )

    assert response.status_code == 401


def test_competition_draft_requires_integration_key(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VYGOTSKY_INTEGRATION_KEY", "integration-secret")
    with TestClient(create_app(tmp_path / "competition-draft.sqlite3")) as http:
        denied = http.post(
            "/api/v1/graph/competition-draft",
            json={"text": "Задачи по случайным лесам и подготовке данных."},
        )
        accepted = http.post(
            "/api/v1/graph/competition-draft",
            headers={"X-Integration-Key": "integration-secret"},
            json={"text": "Задачи по случайным лесам и подготовке данных."},
        )

    assert denied.status_code == 401
    assert accepted.status_code == 200
    assert {item["skill_id"] for item in accepted.json()["requirements"]} == {
        "random-forests", "data-preprocessing",
    }
