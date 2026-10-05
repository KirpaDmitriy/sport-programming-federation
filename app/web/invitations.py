from fastapi import APIRouter, Depends, HTTPException, status

from .auth import current_user, require_role, store
from .schemas import InvitationIn, InvitationStatusIn


router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_invitation(
    payload: InvitationIn,
    user: dict = Depends(require_role("employer")),
    database=Depends(store),
) -> dict:
    employer = database.employer_profile(user["id"])
    if employer is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete employer profile first")
    candidate = database.candidate_profile_by_candidate(payload.candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registered candidate not found")
    if not (
        candidate["profile_visible"]
        and candidate["consent_processing"]
        and candidate["consent_publication"]
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Candidate profile is not available for invitations")
    if payload.vacancy_id:
        vacancy = database.vacancy(payload.vacancy_id)
        if vacancy is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Vacancy not found")
        if database.vacancy_owner(payload.vacancy_id) != user["id"]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Vacancy belongs to another employer")
    values = payload.model_dump()
    values["company_name"] = employer["company_name"]
    invitation_id = database.create_invitation(user["id"], payload.candidate_id, values)
    return {"id": invitation_id, "status": "sent"}


@router.get("")
def invitations(user: dict = Depends(current_user), database=Depends(store)) -> list[dict]:
    if user["role"] == "candidate":
        return database.candidate_invitations(user["id"], mark_viewed=True)
    return database.employer_invitations(user["id"])


@router.patch("/{invitation_id}/status")
def update_invitation_status(
    invitation_id: int,
    payload: InvitationStatusIn,
    user: dict = Depends(require_role("candidate")),
    database=Depends(store),
) -> dict:
    try:
        invitation = database.set_invitation_status(invitation_id, user["id"], payload.status)
    except ValueError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation
