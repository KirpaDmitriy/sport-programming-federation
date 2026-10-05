from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import authenticated_client, candidate_profile, employer_profile


def vacancy_payload() -> dict:
    return {
        "id": "published-backend",
        "employer": "Выготский Лаб",
        "title": "Backend-разработчик",
        "grade": "Junior",
        "specialization": "Backend",
        "description": "Разработка сервисов для продуктовой платформы.",
        "team_description": "Продуктовая команда из пяти инженеров.",
        "work_format": "remote",
        "salary_from": 140000,
        "salary_to": 190000,
        "requirements": [{"skill_id": "python", "level": 0.5, "criticality": 5}],
        "evidence_policy": {"mode": "platform_rating", "competition_ids": []},
    }


def test_candidate_application_and_employer_status_flow(tmp_path) -> None:
    app = create_app(tmp_path / "applications.sqlite3")
    with TestClient(app) as candidate:
        authenticated_client(candidate, "candidate@example.test", "candidate")
        candidate_profile(candidate)
        assert candidate.post(
            "/api/v1/applications",
            json={"vacancy_id": "ml-engineer", "message": "Хочу обсудить задачи вашей команды."},
        ).status_code == 409

        with TestClient(app) as employer:
            authenticated_client(employer, "employer@example.test", "employer")
            employer_profile(employer)
            assert employer.post("/api/v1/vacancies", json=vacancy_payload()).status_code == 201

            created = candidate.post(
                "/api/v1/applications",
                json={
                    "vacancy_id": "published-backend",
                    "message": "Хочу обсудить задачи вашей backend-команды.",
                },
            )
            assert created.status_code == 201
            application_id = created.json()["id"]
            assert candidate.post(
                "/api/v1/applications",
                json={
                    "vacancy_id": "published-backend",
                    "message": "Повторный отклик не должен создаваться.",
                },
            ).status_code == 409

            received = employer.get("/api/v1/applications").json()[0]
            assert received["status"] == "viewed"
            assert received["candidate_contact"] == "candidate@example.test"
            accepted = employer.patch(
                f"/api/v1/applications/{application_id}/status",
                json={"status": "accepted"},
            )
            assert accepted.json()["status"] == "accepted"
            assert employer.patch(
                f"/api/v1/applications/{application_id}/status",
                json={"status": "rejected"},
            ).status_code == 409

        own = candidate.get("/api/v1/applications").json()[0]
        assert own["status"] == "accepted"
        assert own["salary_from"] == 140000


def test_other_employer_cannot_manage_application(tmp_path) -> None:
    app = create_app(tmp_path / "applications.sqlite3")
    with TestClient(app) as candidate:
        authenticated_client(candidate, "candidate@example.test", "candidate")
        candidate_profile(candidate)
        with TestClient(app) as owner:
            authenticated_client(owner, "owner@example.test", "employer")
            employer_profile(owner)
            owner.post("/api/v1/vacancies", json=vacancy_payload())
            application_id = candidate.post(
                "/api/v1/applications",
                json={
                    "vacancy_id": "published-backend",
                    "message": "Хочу присоединиться к вашей продуктовой команде.",
                },
            ).json()["id"]
    with TestClient(app) as stranger:
        authenticated_client(stranger, "stranger@example.test", "employer")
        employer_profile(stranger, "Другая компания")
        assert stranger.get("/api/v1/applications").json() == []
        assert stranger.patch(
            f"/api/v1/applications/{application_id}/status",
            json={"status": "accepted"},
        ).status_code == 404
