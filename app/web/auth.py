import os
import sqlite3
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.infrastructure.database import Store
from app.security import hash_secret, new_session_token, token_digest, verification_code, verify_secret

from .schemas import LoginIn, RegisterIn, VerifyEmailIn


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
SESSION_COOKIE = "vygotsky_session"


def store(request: Request) -> Store:
    return request.app.state.service.store


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "display_name": user["display_name"],
        "email_verified": bool(user["email_verified"]),
    }


def current_user(request: Request, database: Store = Depends(store)) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    user = database.user_for_session(token_digest(token), datetime.now(UTC).isoformat())
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")
    return user


def require_role(role: str):
    def dependency(user: dict = Depends(current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"{role} role required")
        return user

    return dependency


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        samesite="strict",
        secure=os.environ.get("VYGOTSKY_COOKIE_SECURE") == "1",
        path="/",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, database: Store = Depends(store)) -> dict:
    email = payload.email.strip().lower()
    code = verification_code()
    expires_at = datetime.now(UTC) + timedelta(minutes=30)
    try:
        user = database.create_user(
            str(uuid4()),
            email,
            hash_secret(payload.password),
            payload.role,
            payload.display_name.strip(),
            hash_secret(code),
            expires_at.isoformat(),
        )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered") from error

    demo_outbox = os.environ.get("VYGOTSKY_DEMO_AUTH", "1") == "1"
    result = {"user": public_user(user), "verification_delivery": "demo_outbox" if demo_outbox else "email"}
    if demo_outbox:
        result["verification_code"] = code
    else:
        request.app.state.mailer.send_verification(email, code)
    return result


@router.post("/verify-email")
def verify_email(payload: VerifyEmailIn, database: Store = Depends(store)) -> dict:
    user = database.user_by_email(payload.email.strip().lower())
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid email or verification code")
    verification = database.verification(user["id"])
    now = datetime.now(UTC)
    if (
        verification is None
        or verification["attempts"] >= 5
        or datetime.fromisoformat(verification["expires_at"]) <= now
        or not verify_secret(payload.code, verification["code_hash"])
    ):
        if verification is not None:
            database.record_verification_failure(user["id"])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid email or verification code")
    database.verify_user(user["id"])
    return {"verified": True}


@router.post("/login")
def login(payload: LoginIn, response: Response, database: Store = Depends(store)) -> dict:
    user = database.user_by_email(payload.email.strip().lower())
    if user is None or not verify_secret(payload.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user["email_verified"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email is not verified")
    token, digest = new_session_token()
    expires_at = datetime.now(UTC) + timedelta(days=7)
    database.delete_expired_sessions(datetime.now(UTC).isoformat())
    database.create_session(digest, user["id"], expires_at.isoformat())
    set_session_cookie(response, token)
    return {"user": public_user(user), "expires_at": expires_at.isoformat()}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, database: Store = Depends(store)) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        database.delete_session(token_digest(token))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    return public_user(user)
