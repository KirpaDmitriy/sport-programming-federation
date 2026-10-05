from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.application.service import TalentService
from app.infrastructure.fsp import sync_fsp_payload

from .auth import require_role
from .schemas import FspPayloadIn, OfferIn, VacancyIn


router = APIRouter(prefix="/api/v1")


def service(request: Request) -> TalentService:
    return request.app.state.service


@router.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "kodrazryad", "offline": True}


@router.get("/catalog", tags=["catalog"])
def catalog(talent: TalentService = Depends(service)) -> dict:
    return talent.catalog()


@router.get("/candidates", tags=["talent"])
def candidates(
    category: str | None = None,
    work_format: str | None = None,
    talent: TalentService = Depends(service),
) -> list[dict]:
    return talent.candidates(category, work_format)


@router.get("/candidates/{candidate_id}", tags=["talent"])
def candidate(
    candidate_id: str,
    vacancy_id: str | None = None,
    talent: TalentService = Depends(service),
) -> dict:
    if vacancy_id and talent.store.vacancy(vacancy_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
    result = talent.candidate_detail(candidate_id, vacancy_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    return result


@router.get("/candidates/{candidate_id}/offers", tags=["offers"])
def candidate_offers(
    candidate_id: str,
    talent: TalentService = Depends(service),
    user: dict = Depends(require_role("candidate")),
) -> list[dict]:
    if talent.store.candidate(candidate_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    profile = talent.store.candidate_profile(user["id"])
    if profile is None or profile["candidate_id"] != candidate_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the profile owner can access offers")
    return talent.store.offers(candidate_id)


@router.get("/vacancies", tags=["matching"])
def vacancies(talent: TalentService = Depends(service)) -> list[dict]:
    return talent.vacancies()


@router.post("/vacancies", status_code=status.HTTP_201_CREATED, tags=["matching"])
def create_vacancy(
    payload: VacancyIn,
    talent: TalentService = Depends(service),
    user: dict = Depends(require_role("employer")),
) -> dict:
    unknown = {item.skill_id for item in payload.requirements} - talent.store.skills().keys()
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown skills: {sorted(unknown)}")
    owner = talent.store.vacancy_owner(payload.id)
    if talent.store.vacancy(payload.id) is not None and owner != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vacancy belongs to another account or demo catalog")
    profile = talent.store.employer_profile(user["id"])
    if profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete employer profile first")
    vacancy = payload.domain()
    if vacancy.employer != profile["company_name"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Employer must match company profile")
    return talent.save_vacancy(vacancy, user["id"])


@router.get("/vacancies/{vacancy_id}/matches", tags=["matching"])
def matches(
    vacancy_id: str,
    category: str | None = Query(default=None),
    talent: TalentService = Depends(service),
) -> list[dict]:
    result = talent.matches(vacancy_id, category)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
    return result


@router.post("/offers", status_code=status.HTTP_201_CREATED, tags=["offers"])
def create_offer(
    payload: OfferIn,
    user: dict = Depends(require_role("employer")),
) -> dict:
    raise HTTPException(
        status.HTTP_410_GONE,
        "Legacy offers are replaced by /api/v1/invitations with role-based access",
    )


@router.post("/integrations/fsp/sync", tags=["integrations"])
def sync_fsp(payload: FspPayloadIn, talent: TalentService = Depends(service)) -> dict:
    try:
        return sync_fsp_payload(talent.store, payload.model_dump())
    except (KeyError, ValueError) as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid FSP payload: {error}") from error
