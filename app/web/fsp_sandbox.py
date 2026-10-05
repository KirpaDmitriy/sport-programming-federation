import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.application.graph_extraction import extract_skill_drafts
from app.infrastructure.fsp import sync_fsp_payload
from app.infrastructure.fsp_sandbox import COMPETITIONS, IDENTITIES, RESULTS, authenticate, sign_request, verify_request
from app.security import new_session_token, token_digest

from .auth import require_role
from .api import service


router = APIRouter(tags=["fsp-sandbox"])


class SandboxAuthorizeIn(BaseModel):
    request_token: str = Field(min_length=20, max_length=4000)
    participant_id: str = Field(min_length=1, max_length=120)
    pin: str = Field(min_length=4, max_length=20)


def _authorization_page(request_token: str) -> str:
    identities = "".join(
        f"<button type='button' class='identity' data-id='{participant_id}' data-pin='{item['pin']}'>"
        f"<strong>{item['name']}</strong><span>{participant_id} · {item['region']}</span></button>"
        for participant_id, item in IDENTITIES.items()
    )
    token_json = json.dumps(request_token)
    return f"""<!doctype html><html lang='ru'><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'><title>Вход по ФСП ID</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#121316;font-family:Arial,sans-serif}}
main{{width:min(560px,calc(100% - 32px));background:white;border:1px solid #dfe2e8;border-radius:28px;padding:32px;box-shadow:0 24px 80px #1b24451c}}
.brand{{display:flex;gap:12px;align-items:center;font-weight:800;font-size:20px}}.mark{{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#111;color:#c8ff47}}
h1{{font-size:32px;line-height:1.05;margin:28px 0 10px}}p{{color:#5d6370;line-height:1.5}}.list{{display:grid;gap:10px;margin:24px 0}}
.identity{{display:flex;justify-content:space-between;gap:12px;text-align:left;padding:16px;border:1px solid #dfe2e8;border-radius:16px;background:#fff;cursor:pointer}}.identity:hover{{border-color:#6d49ff;background:#f7f4ff}}.identity span{{color:#747b88}}
.note{{font-size:13px;background:#f2f3f6;padding:12px 14px;border-radius:12px}}#status{{min-height:20px;color:#a13629;font-size:14px}}
</style></head><body><main><div class='brand'><span class='mark'>ФСП</span>Тестовый вход ФСП ID</div>
<h1>Выберите учебный профиль</h1><p>Это безопасный синтетический стенд. Все имена, результаты и идентификаторы ниже вымышлены.</p>
<div class='list'>{identities}</div><p class='note'>Нажатие имитирует вход на стороне ФСП и передачу одноразового разрешения сервису «Выготский».</p><p id='status'></p></main>
<script>const requestToken={token_json};document.querySelectorAll('.identity').forEach(button=>button.addEventListener('click',async()=>{{
document.getElementById('status').textContent='Проверяем ФСП ID…';
const response=await fetch('/fsp-id/oauth/authorize',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{request_token:requestToken,participant_id:button.dataset.id,pin:button.dataset.pin}})}});
const body=await response.json();if(!response.ok){{document.getElementById('status').textContent=body.detail||'Не удалось войти';return}}window.location.assign(body.redirect_to);
}}));</script></body></html>"""


@router.post("/api/v1/integrations/fsp/connect/start")
def start_connection(
    request: Request,
    talent=Depends(service),
    user: dict = Depends(require_role("candidate")),
) -> dict:
    if talent.store.candidate_profile(user["id"]) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Сначала сохраните профиль кандидата")
    state_token, _ = new_session_token()
    request_token = sign_request({"user_id": user["id"], "state": state_token})
    return {"authorize_url": f"/fsp-id/oauth/authorize?request_token={request_token}", "expires_in": 300}


@router.get("/fsp-id/oauth/authorize", response_class=HTMLResponse)
def authorize_page(request_token: str = Query(min_length=20, max_length=4000)) -> HTMLResponse:
    try:
        verify_request(request_token)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    return HTMLResponse(_authorization_page(request_token))


@router.post("/fsp-id/oauth/authorize")
def authorize(payload: SandboxAuthorizeIn, talent=Depends(service)) -> dict:
    try:
        request_payload = verify_request(payload.request_token)
        identity = authenticate(payload.participant_id, payload.pin)
    except ValueError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
    code, digest = new_session_token()
    talent.store.create_fsp_oauth_code(
        digest,
        request_payload["user_id"],
        identity["id"],
        request_payload["state"],
        (datetime.now(UTC) + timedelta(minutes=2)).isoformat(),
    )
    return {
        "redirect_to": f"/api/v1/integrations/fsp/connect/callback?code={code}&state={request_payload['state']}"
    }


def _sandbox_payload(talent, user_id: str, participant_id: str) -> dict:
    profile = talent.store.candidate_profile(user_id)
    if profile is None:
        raise ValueError("Candidate profile is required")
    results = RESULTS[participant_id]
    competition_ids = {item["competition_id"] for item in results}
    competitions = []
    disciplines = {}
    for competition_id in competition_ids:
        source = COMPETITIONS[competition_id]
        disciplines[source["discipline_id"]] = {
            "id": source["discipline_id"],
            "name": "Продуктовое программирование" if source["discipline_id"] == "product" else "Алгоритмическое программирование",
        }
        drafts = extract_skill_drafts(source["description"], talent.store.skills())
        competitions.append({
            "id": competition_id,
            "name": source["name"],
            "discipline_id": source["discipline_id"],
            "participants": source["participants"],
            "difficulty": source["difficulty"],
            "official": source["official"],
            "starts_on": source["starts_on"],
            "skills": {item.skill_id: item.relevance for item in drafts},
        })
    return {
        "disciplines": list(disciplines.values()),
        "participants": [{
            "id": profile["candidate_id"],
            "name": profile["name"],
            "city": profile["city"],
            "work_format": profile["work_format"],
            "desired_role": profile["desired_role"],
            "about": profile["about"],
            "stack": profile["stack"],
        }],
        "competitions": competitions,
        "results": [{**item, "participant_id": profile["candidate_id"]} for item in results],
    }


@router.get("/api/v1/integrations/fsp/connect/callback")
def connection_callback(
    code: str,
    state: str,
    talent=Depends(service),
    user: dict = Depends(require_role("candidate")),
) -> RedirectResponse:
    grant = talent.store.consume_fsp_oauth_code(
        token_digest(code), user["id"], state, datetime.now(UTC).isoformat(),
    )
    if grant is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Код ФСП ID истёк, уже использован или выдан другому аккаунту")
    try:
        sync_fsp_payload(talent.store, _sandbox_payload(talent, user["id"], grant["participant_id"]))
        talent.store.set_candidate_fsp_id(user["id"], grant["participant_id"])
    except (KeyError, ValueError) as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    return RedirectResponse("/?fsp=connected", status_code=status.HTTP_303_SEE_OTHER)
