from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import create_app
from app.security import token_digest


def register(http: TestClient, email: str = "candidate@example.test", role: str = "candidate") -> tuple[str, str]:
    response = http.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "role": role,
            "display_name": "Тестовый пользователь",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["verification_delivery"] == "demo_outbox"
    return email, body["verification_code"]


def test_verified_account_login_and_logout(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "auth.sqlite3")) as http:
        email, code = register(http)
        assert http.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "correct-horse-battery"},
        ).status_code == 403
        assert http.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "code": code},
        ).json() == {"verified": True}

        login = http.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "correct-horse-battery"},
        )
        assert login.status_code == 200
        assert login.cookies["vygotsky_session"]
        assert http.get("/api/v1/auth/me").json()["email"] == email
        assert http.post("/api/v1/auth/logout").status_code == 204
        assert http.get("/api/v1/auth/me").status_code == 401


def test_password_and_session_token_are_not_stored_in_plaintext(tmp_path) -> None:
    app = create_app(tmp_path / "auth.sqlite3")
    with TestClient(app) as http:
        email, code = register(http)
        user = app.state.service.store.user_by_email(email)
        assert user is not None
        assert user["password_hash"].startswith("scrypt$")
        assert "correct-horse-battery" not in user["password_hash"]
        http.post("/api/v1/auth/verify-email", json={"email": email, "code": code})
        login = http.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "correct-horse-battery"},
        )
        raw_token = login.cookies["vygotsky_session"]
        with app.state.service.store.connection() as connection:
            stored = connection.execute("SELECT token_hash FROM sessions").fetchone()[0]
        assert stored == token_digest(raw_token)
        assert stored != raw_token


def test_expired_session_and_verification_attempt_limit_are_rejected(tmp_path) -> None:
    app = create_app(tmp_path / "auth.sqlite3")
    with TestClient(app) as http:
        email, code = register(http)
        for _ in range(5):
            assert http.post(
                "/api/v1/auth/verify-email",
                json={"email": email, "code": "000000" if code != "000000" else "999999"},
            ).status_code == 400
        assert http.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "code": code},
        ).status_code == 400

        second_email, second_code = register(http, "employer@example.test", "employer")
        http.post("/api/v1/auth/verify-email", json={"email": second_email, "code": second_code})
        login = http.post(
            "/api/v1/auth/login",
            json={"email": second_email, "password": "correct-horse-battery"},
        )
        raw_token = login.cookies["vygotsky_session"]
        with app.state.service.store.connection() as connection:
            connection.execute(
                "UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
                ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(), token_digest(raw_token)),
            )
        assert http.get("/api/v1/auth/me").status_code == 401


def test_duplicate_email_and_wrong_credentials_are_rejected(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "auth.sqlite3")) as http:
        email, _ = register(http)
        duplicate = http.post(
            "/api/v1/auth/register",
            json={
                "email": email.upper(),
                "password": "another-secure-password",
                "role": "candidate",
                "display_name": "Другой пользователь",
            },
        )
        assert duplicate.status_code == 409
        assert http.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong"},
        ).status_code == 401
