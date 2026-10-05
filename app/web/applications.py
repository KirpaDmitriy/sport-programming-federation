import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from .auth import current_user, require_role, store
from .schemas import ApplicationIn, ApplicationStatusIn


router = APIRouter(prefix="/api/v1/applications", tags=["applications"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationIn,
    user: dict = Depends(require_role("candidate")),
    database=Depends(store),
) -> dict:
    profile = database.candidate_profile(user["id"])
    if profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete candidate profile first")
    if database.vacancy(payload.vacancy_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
    if database.vacancy_owner(payload.vacancy_id) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Demo vacancy does not accept applications")
    try:
        application_id = database.create_application(
            user["id"], profile["candidate_id"], payload.vacancy_id, payload.message,
        )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "Application already exists") from error
    return {"id": application_id, "status": "submitted"}


@router.get("")
def applications(user: dict = Depends(current_user), database=Depends(store)) -> list[dict]:
    if user["role"] == "candidate":
        return database.candidate_applications(user["id"])
    return database.employer_applications(user["id"], mark_viewed=True)


@router.patch("/{application_id}/status")
def update_application_status(
    application_id: int,
    payload: ApplicationStatusIn,
    user: dict = Depends(require_role("employer")),
    database=Depends(store),
) -> dict:
    try:
        application = database.set_application_status(application_id, user["id"], payload.status)
    except ValueError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return application
