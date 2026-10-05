from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.assessment import QUESTION_BY_ID, grade_attempt, select_questions

from .auth import require_role, store
from .schemas import AssessmentStartIn, AssessmentSubmitIn


router = APIRouter(prefix="/api/v1/assessments", tags=["assessments"])
GRADE_COOLDOWN = timedelta(days=90)


def public_question(question) -> dict:
    return {
        "id": question.id,
        "grade": question.grade,
        "family": question.family,
        "skill_id": question.skill_id,
        "prompt": question.prompt,
        "options": question.options,
    }


def check_grade_change(profile: dict, target_grade: str, now: datetime) -> None:
    verified_grade = profile["verified_grade"]
    changed_at = profile["grade_changed_at"]
    if verified_grade and target_grade != verified_grade and changed_at:
        available_at = datetime.fromisoformat(changed_at) + GRADE_COOLDOWN
        if now < available_at:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {"message": "Grade change is on cooldown", "available_at": available_at.isoformat()},
            )


@router.post("/start", status_code=status.HTTP_201_CREATED)
def start_assessment(
    payload: AssessmentStartIn,
    user: dict = Depends(require_role("candidate")),
    database=Depends(store),
) -> dict:
    profile = database.candidate_profile(user["id"])
    if profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete candidate profile first")
    now = datetime.now(UTC)
    history = database.assessment_history(user["id"])
    if not history and payload.target_grade != profile["claimed_grade"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "First assessment must match the claimed grade")
    check_grade_change(profile, payload.target_grade, now)
    attempt_id = str(uuid4())
    try:
        questions = select_questions(attempt_id, profile["specialization"], payload.target_grade)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    database.create_assessment_attempt(
        attempt_id,
        user["id"],
        profile["candidate_id"],
        profile["specialization"],
        payload.target_grade,
        [question.id for question in questions],
        now.isoformat(),
    )
    return {
        "id": attempt_id,
        "specialization": profile["specialization"],
        "target_grade": payload.target_grade,
        "questions": [public_question(question) for question in questions],
        "method": "calibrated_variant_blueprint_v1",
    }


@router.post("/{attempt_id}/submit")
def submit_assessment(
    attempt_id: str,
    payload: AssessmentSubmitIn,
    user: dict = Depends(require_role("candidate")),
    database=Depends(store),
) -> dict:
    attempt = database.assessment_attempt(attempt_id, user["id"])
    if attempt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found")
    if attempt["status"] != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Assessment is already completed")
    try:
        questions = tuple(QUESTION_BY_ID[question_id] for question_id in attempt["question_ids"])
    except KeyError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "Assessment blueprint is no longer available") from error
    if any(index < 0 or index >= len(QUESTION_BY_ID[question_id].options) for question_id, index in payload.answers.items() if question_id in QUESTION_BY_ID):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Answer index is outside question options")
    try:
        result = grade_attempt(attempt["target_grade"], questions, payload.answers)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    profile = database.candidate_profile(user["id"])
    if profile is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Candidate profile is missing")
    now = datetime.now(UTC)
    if result["passed"]:
        check_grade_change(profile, attempt["target_grade"], now)
    try:
        database.complete_assessment(
            attempt_id,
            user["id"],
            attempt["target_grade"],
            payload.answers,
            result,
            now.isoformat(),
        )
    except ValueError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
    return {
        "id": attempt_id,
        "score": result["score"],
        "passed": result["passed"],
        "outcome": result["outcome"],
        "target_grade": attempt["target_grade"],
        "recommended_grade": result["recommended_grade"],
        "category": f"{attempt['specialization']}:{attempt['target_grade']}" if result["passed"] else None,
        "skill_signals": result["skill_signals"],
    }


@router.get("/history")
def assessment_history(user: dict = Depends(require_role("candidate")), database=Depends(store)) -> list[dict]:
    return database.assessment_history(user["id"])
