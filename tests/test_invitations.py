from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import authenticated_client, candidate_profile, employer_profile


def test_reverse_invitation_reveals_contact_only_after_acceptance(tmp_path) -> None:
    app = create_app(tmp_path / "invitations.sqlite3")
    with TestClient(app) as candidate:
        authenticated_client(candidate, "candidate@example.test", "candidate", "Новый кандидат")
        candidate_profile(candidate, visible=True)
        candidate_id = candidate.get("/api/v1/account/profile").json()["profile"]["candidate_id"]

        with TestClient(app) as employer:
            authenticated_client(employer, "employer@example.test", "employer", "Работодатель")
            employer_profile(employer, "Карьера Лаб")
            created = employer.post(
                "/api/v1/invitations",
                json={
                    "candidate_id": candidate_id,
                    "vacancy_id": None,
                    "position_title": "Backend-разработчик",
                    "salary_from": 180000,
                    "salary_to": 250000,
                    "description": "Приглашаем строить платформу доказательного найма.",
                    "contact_method": "jobs@example.test",
                },
            )
            assert created.status_code == 201
            invitation_id = created.json()["id"]
            before = employer.get("/api/v1/invitations").json()[0]
            assert before["status"] == "sent"
            assert before["candidate_contact"] is None

            inbox = candidate.get("/api/v1/invitations").json()[0]
            assert inbox["status"] == "viewed"
            assert inbox["contact_method"] == "jobs@example.test"
            accepted = candidate.patch(
                f"/api/v1/invitations/{invitation_id}/status",
                json={"status": "accepted"},
            )
            assert accepted.status_code == 200
            assert accepted.json()["status"] == "accepted"
            assert candidate.patch(
                f"/api/v1/invitations/{invitation_id}/status",
                json={"status": "rejected"},
            ).status_code == 409

            after = employer.get("/api/v1/invitations").json()[0]
            assert after["candidate_contact"] == "candidate@example.test"


def test_candidate_cannot_change_another_candidates_invitation(tmp_path) -> None:
    app = create_app(tmp_path / "invitations.sqlite3")
    with TestClient(app) as first:
        authenticated_client(first, "first@example.test", "candidate")
        candidate_profile(first)
        first_id = first.get("/api/v1/account/profile").json()["profile"]["candidate_id"]
        with TestClient(app) as employer:
            authenticated_client(employer, "employer@example.test", "employer")
            employer_profile(employer)
            invitation_id = employer.post(
                "/api/v1/invitations",
                json={
                    "candidate_id": first_id,
                    "position_title": "Data engineer",
                    "salary_from": 170000,
                    "salary_to": 230000,
                    "description": "Предлагаем обсудить задачи платформы данных.",
                    "contact_method": "jobs@example.test",
                },
            ).json()["id"]

    with TestClient(app) as second:
        authenticated_client(second, "second@example.test", "candidate")
        candidate_profile(second)
        assert second.patch(
            f"/api/v1/invitations/{invitation_id}/status",
            json={"status": "accepted"},
        ).status_code == 404


def test_invitation_rejects_invalid_salary_and_foreign_vacancy(tmp_path) -> None:
    app = create_app(tmp_path / "invitations.sqlite3")
    with TestClient(app) as candidate:
        authenticated_client(candidate, "candidate@example.test", "candidate")
        candidate_profile(candidate)
        candidate_id = candidate.get("/api/v1/account/profile").json()["profile"]["candidate_id"]
    with TestClient(app) as employer:
        authenticated_client(employer, "employer@example.test", "employer")
        employer_profile(employer)
        invalid = {
            "candidate_id": candidate_id,
            "position_title": "Backend-разработчик",
            "salary_from": 250000,
            "salary_to": 180000,
            "description": "Предлагаем обсудить разработку платформы.",
            "contact_method": "jobs@example.test",
        }
        assert employer.post("/api/v1/invitations", json=invalid).status_code == 422
        assert employer.post(
            "/api/v1/invitations",
            json={**invalid, "salary_from": 180000, "vacancy_id": "ml-engineer"},
        ).status_code == 403
