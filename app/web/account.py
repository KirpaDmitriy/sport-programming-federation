from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.domain.models import Candidate
from app.domain.scoring import build_profile
from app.pdf_profile import build_candidate_pdf

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
    saved = database.candidate_profile(user["id"])
    profile_data = payload.model_dump()
    # FSP ID is written only after the signed connection flow; profile edits cannot spoof it.
    profile_data["fsp_id"] = saved["fsp_id"] if saved else None
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
    database.save_candidate_profile(user["id"], candidate, profile_data)
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


@router.get("/profile.pdf", response_class=Response)
def profile_pdf(user: dict = Depends(require_role("candidate")), database=Depends(store)) -> Response:
    profile = database.candidate_profile(user["id"])
    if profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete candidate profile first")
    candidate_id = profile["candidate_id"]
    skills = database.skills()
    competitions = database.competitions()
    achievements = database.achievements(candidate_id)
    computed = build_profile(
        candidate_id,
        skills,
        competitions,
        achievements,
        test_signals=database.test_skill_signals(candidate_id),
    )
    evidence = []
    for achievement in achievements:
        competition = competitions[achievement.competition_id]
        evidence.append({
            **asdict(achievement),
            "competition": competition.name,
            "discipline": competition.discipline,
        })
    content = build_candidate_pdf(profile, asdict(computed), evidence)
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="vygotsky-profile.pdf"'},
    )
