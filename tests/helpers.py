from fastapi.testclient import TestClient


def authenticated_client(
    http: TestClient,
    email: str,
    role: str,
    display_name: str = "Тестовый пользователь",
) -> None:
    registration = http.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "role": role,
            "display_name": display_name,
        },
    )
    assert registration.status_code == 201
    code = registration.json()["verification_code"]
    assert http.post(
        "/api/v1/auth/verify-email", json={"email": email, "code": code},
    ).status_code == 200
    assert http.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "correct-horse-battery"},
    ).status_code == 200


def employer_profile(http: TestClient, company_name: str = "Карьера Лаб") -> None:
    response = http.put(
        "/api/v1/account/employer-profile",
        json={
            "company_name": company_name,
            "description": "Команда создаёт инструменты доказательного найма.",
            "industry": "HR Tech",
            "contact_method": "jobs@example.test",
        },
    )
    assert response.status_code == 200


def candidate_profile(http: TestClient, visible: bool = True) -> None:
    response = http.put(
        "/api/v1/account/candidate-profile",
        json={
            "name": "Новый кандидат",
            "city": "Казань",
            "work_format": "remote",
            "desired_role": "Backend-разработчик",
            "about": "Разрабатываю сервисы и участвую в соревнованиях.",
            "stack": ["Python", "PostgreSQL"],
            "industry": "ИТ",
            "specialization": "backend",
            "claimed_grade": "junior",
            "fsp_id": None,
            "contact_email": "candidate@example.test",
            "years_experience": 1,
            "roles": ["developer"],
            "soft_skills": ["командная работа"],
            "profile_visible": visible,
            "consent_processing": True,
            "consent_publication": visible,
        },
    )
    assert response.status_code == 200
