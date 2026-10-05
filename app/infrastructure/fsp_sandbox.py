import base64
import hashlib
import hmac
import json
import os
import time


IDENTITIES = {
    "FSP-2026-1042": {"name": "Елена Соколова", "region": "Москва", "pin": "1042"},
    "FSP-2026-2087": {"name": "Алексей Морозов", "region": "Казань", "pin": "2087"},
    "FSP-2026-3154": {"name": "Мария Волкова", "region": "Новосибирск", "pin": "3154"},
}

COMPETITIONS = {
    "fsp-data-cup-2026": {
        "name": "Кубок ФСП по продуктовому программированию 2026",
        "discipline_id": "product",
        "description": "Команды готовили данные и строили модели на основе решающих деревьев, случайных лесов и градиентного бустинга на Python.",
        "participants": 420,
        "difficulty": 0.86,
        "official": True,
        "starts_on": "2026-05-18",
    },
    "fsp-algo-cup-2026": {
        "name": "Кубок России по алгоритмическому программированию 2026",
        "discipline_id": "algo",
        "description": "Участники решали задачи на алгоритмы и структуры данных, используя C++ и Python.",
        "participants": 640,
        "difficulty": 0.94,
        "official": True,
        "starts_on": "2026-06-25",
    },
}

RESULTS = {
    "FSP-2026-1042": [
        {"id": "sandbox-1042-data", "competition_id": "fsp-data-cup-2026", "placement": 5, "participants": 420, "role": "developer", "rank": "КМС"},
    ],
    "FSP-2026-2087": [
        {"id": "sandbox-2087-algo", "competition_id": "fsp-algo-cup-2026", "placement": 12, "participants": 640, "role": "captain", "rank": "КМС"},
    ],
    "FSP-2026-3154": [
        {"id": "sandbox-3154-data", "competition_id": "fsp-data-cup-2026", "placement": 2, "participants": 420, "role": "analyst", "rank": "МС"},
        {"id": "sandbox-3154-algo", "competition_id": "fsp-algo-cup-2026", "placement": 35, "participants": 640, "role": "developer", "rank": "I"},
    ],
}


def _secret() -> bytes:
    return os.environ.get(
        "VYGOTSKY_FSP_SANDBOX_SECRET",
        os.environ.get("VYGOTSKY_INTEGRATION_KEY", "local-fsp-sandbox-secret"),
    ).encode()


def sign_request(payload: dict, lifetime_seconds: int = 300) -> str:
    document = {**payload, "exp": int(time.time()) + lifetime_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(document, separators=(",", ":")).encode()).rstrip(b"=")
    signature = hmac.new(_secret(), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def verify_request(token: str) -> dict:
    try:
        encoded_text, signature_text = token.split(".", 1)
        encoded = encoded_text.encode()
        expected = hmac.new(_secret(), encoded, hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("Invalid sandbox request signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded_text + "=" * (-len(encoded_text) % 4)))
    except (ValueError, json.JSONDecodeError) as error:
        raise ValueError("Invalid sandbox request") from error
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Sandbox request expired")
    return payload


def authenticate(participant_id: str, pin: str) -> dict:
    identity = IDENTITIES.get(participant_id)
    if identity is None or not hmac.compare_digest(identity["pin"], pin):
        raise ValueError("Invalid FSP ID or access code")
    return {"id": participant_id, "name": identity["name"], "region": identity["region"]}
