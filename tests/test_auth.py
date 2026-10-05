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
        assert http.get("/api/v1/auth/session").json() == {"authenticated": False, "user": None}
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


def test_production_registration_sends_verification_email(tmp_path, monkeypatch) -> None:
    sent = []

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("smtp.example.test", 587, 15)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def starttls(self):
            return None

        def login(self, username, password):
            assert (username, password) == ("smtp-user", "smtp-pass")

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setenv("VYGOTSKY_DEMO_AUTH", "0")
    monkeypatch.setenv("VYGOTSKY_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("VYGOTSKY_SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("VYGOTSKY_SMTP_PASSWORD", "smtp-pass")
    monkeypatch.setenv("VYGOTSKY_SMTP_FROM", "hello@example.test")
    monkeypatch.setattr("app.infrastructure.mailer.smtplib.SMTP", FakeSmtp)

    with TestClient(create_app(tmp_path / "smtp.sqlite3")) as http:
        response = http.post(
            "/api/v1/auth/register",
            json={
                "email": "mail@example.test",
                "password": "correct-horse-battery",
                "role": "candidate",
                "display_name": "Почтовый пользователь",
            },
        )

    assert response.status_code == 201
    assert response.json()["verification_delivery"] == "email"
    assert "verification_code" not in response.json()
    assert sent[0]["To"] == "mail@example.test"
    assert "код подтверждения" in sent[0].get_content()
