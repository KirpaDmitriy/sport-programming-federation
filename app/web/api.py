from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.application.service import TalentService
from app.infrastructure.fsp import sync_fsp_payload

from .schemas import FspPayloadIn, OfferIn, VacancyIn


router = APIRouter(prefix="/api/v1")


def service(request: Request) -> TalentService:
    return request.app.state.service


@router.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "kontur", "offline": True}


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
    result = talent.candidate_detail(candidate_id, vacancy_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    return result


@router.get("/candidates/{candidate_id}/offers", tags=["offers"])
def candidate_offers(candidate_id: str, talent: TalentService = Depends(service)) -> list[dict]:
    if talent.store.candidate(candidate_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    return talent.store.offers(candidate_id)


@router.get("/vacancies", tags=["matching"])
def vacancies(talent: TalentService = Depends(service)) -> list[dict]:
    return talent.vacancies()


@router.post("/vacancies", status_code=status.HTTP_201_CREATED, tags=["matching"])
def create_vacancy(payload: VacancyIn, talent: TalentService = Depends(service)) -> dict:
    unknown = {item.skill_id for item in payload.requirements} - talent.store.skills().keys()
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown skills: {sorted(unknown)}")
    return talent.save_vacancy(payload.domain())


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
def create_offer(payload: OfferIn, talent: TalentService = Depends(service)) -> dict:
    if talent.store.candidate(payload.candidate_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    vacancy = talent.store.vacancy(payload.vacancy_id)
    if vacancy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
    offer_id = talent.store.create_offer(
        payload.candidate_id,
        payload.vacancy_id,
        payload.salary_from,
        payload.salary_to,
        payload.message,
    )
    return {"id": offer_id, "status": "new"}


@router.post("/integrations/fsp/sync", tags=["integrations"])
def sync_fsp(payload: FspPayloadIn, talent: TalentService = Depends(service)) -> dict:
    try:
        return sync_fsp_payload(talent.store, payload.model_dump())
    except (KeyError, ValueError) as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid FSP payload: {error}") from error
