from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import authenticated_client, candidate_profile, employer_profile


def test_candidate_controls_profile_visibility_and_cannot_write_employer_profile(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "accounts.sqlite3")) as http:
        authenticated_client(http, "candidate@example.test", "candidate")
        candidate_profile(http, visible=False)
        assert all(item["name"] != "Новый кандидат" for item in http.get("/api/v1/candidates").json())
        assert http.put(
            "/api/v1/account/employer-profile",
            json={
                "company_name": "Чужая компания",
                "description": "Недоступное изменение ролевого профиля.",
                "industry": "ИТ",
                "contact_method": "owner@example.test",
            },
        ).status_code == 403
        candidate_profile(http, visible=True)
        candidates = http.get("/api/v1/candidates").json()
        public_profile = next(item for item in candidates if item["name"] == "Новый кандидат")
        assert "contact_email" not in public_profile
        assert any(item["name"] == "Новый кандидат" for item in http.get(
            "/api/v1/candidates?specialization=backend&grade=junior&stack=python&has_fsp=false"
        ).json())
        assert http.get("/api/v1/candidates?has_fsp=true&specialization=backend").json() == []


def test_employer_owns_vacancy_and_cannot_overwrite_demo_or_foreign_vacancy(tmp_path) -> None:
    app = create_app(tmp_path / "accounts.sqlite3")
    vacancy = {
        "id": "owned-python-role",
        "employer": "Выготский Лаб",
        "title": "Python-разработчик",
        "grade": "Junior",
        "specialization": "Backend",
        "description": "Разработка сервисов для продуктовой платформы.",
        "team_description": "Продуктовая команда из пяти инженеров.",
        "work_format": "remote",
        "salary_from": 130000,
        "salary_to": 180000,
        "requirements": [{"skill_id": "python", "level": 0.5, "criticality": 5}],
        "evidence_policy": {"mode": "platform_rating", "competition_ids": []},
    }
    with TestClient(app) as first:
        authenticated_client(first, "first@example.test", "employer")
        employer_profile(first)
        assert first.post("/api/v1/vacancies", json=vacancy).status_code == 201
        assert first.post("/api/v1/vacancies", json={**vacancy, "id": "ml-engineer"}).status_code == 403
        assert len(first.get("/api/v1/account/vacancies").json()) == 1

    with TestClient(app) as second:
        authenticated_client(second, "second@example.test", "employer")
        employer_profile(second, "Другая команда")
        assert second.post(
            "/api/v1/vacancies", json={**vacancy, "employer": "Другая команда"},
        ).status_code == 403


def test_visible_profile_requires_processing_consent(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "accounts.sqlite3")) as http:
        authenticated_client(http, "candidate@example.test", "candidate")
        payload = {
            "name": "Новый кандидат",
            "city": "Казань",
            "work_format": "remote",
            "desired_role": "Backend-разработчик",
            "about": "Разрабатываю сервисы и участвую в соревнованиях.",
            "stack": ["Python"],
            "industry": "ИТ",
            "specialization": "backend",
            "claimed_grade": "junior",
            "contact_email": "candidate@example.test",
            "years_experience": 1,
            "profile_visible": True,
            "consent_processing": False,
            "consent_publication": True,
        }
        assert http.put("/api/v1/account/candidate-profile", json=payload).status_code == 422
