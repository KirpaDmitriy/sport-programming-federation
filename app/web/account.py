from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.models import Candidate

from .auth import current_user, require_role, store
from .schemas import CandidateProfileIn, EmployerProfileIn


router = APIRouter(prefix="/api/v1/account", tags=["account"])


@router.get("/profile")
def profile(user: dict = Depends(current_user), database=Depends(store)) -> dict:
    if user["role"] == "candidate":
        saved = database.candidate_profile(user["id"])
    else:
        saved = database.employer_profile(user["id"])
    return {"role": user["role"], "profile": saved}


@router.put("/candidate-profile")
def update_candidate_profile(
    payload: CandidateProfileIn,
    user: dict = Depends(require_role("candidate")),
    database=Depends(store),
) -> dict:
    candidate = Candidate(
        user["id"],
        payload.name.strip(),
        payload.city.strip(),
        payload.work_format,
        payload.desired_role.strip(),
        payload.about.strip(),
        tuple(dict.fromkeys(item.strip() for item in payload.stack if item.strip())),
    )
    if not candidate.stack:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Stack cannot be empty")
    database.save_candidate_profile(user["id"], candidate, payload.model_dump())
    return {"role": "candidate", "profile": database.candidate_profile(user["id"])}


@router.put("/employer-profile")
def update_employer_profile(
    payload: EmployerProfileIn,
    user: dict = Depends(require_role("employer")),
    database=Depends(store),
) -> dict:
    database.save_employer_profile(user["id"], payload.model_dump())
    return {"role": "employer", "profile": database.employer_profile(user["id"])}


@router.get("/vacancies")
def account_vacancies(user: dict = Depends(require_role("employer")), database=Depends(store)) -> list[dict]:
    return [asdict(item) for item in database.owned_vacancies(user["id"])]
