from fastapi.testclient import TestClient

from app.domain.assessment import QUESTION_BY_ID, grade_attempt, select_questions
from app.domain.models import Requirement, Skill, Vacancy
from app.domain.scoring import build_profile, match_candidate
from app.main import create_app

from .helpers import authenticated_client, candidate_profile


def test_calibrated_blueprints_vary_wording_without_changing_coverage() -> None:
    first = select_questions("a", "backend", "middle")
    second = select_questions("b", "backend", "middle")

    assert [question.id for question in first] != [question.id for question in second]
    assert [(q.grade, q.family, q.skill_id) for q in first] == [
        (q.grade, q.family, q.skill_id) for q in second
    ]


def test_grade_result_never_downgrades_and_can_recommend_next_grade() -> None:
    questions = select_questions("strong", "data", "junior")
    correct = {question.id: question.correct_index for question in questions}
    wrong = {question.id: (question.correct_index + 1) % len(question.options) for question in questions}

    strong = grade_attempt("junior", questions, correct)
    failed = grade_attempt("junior", questions, wrong)

    assert strong["passed"] is True
    assert strong["recommended_grade"] == "middle"
    assert failed["passed"] is False
    assert failed["outcome"] == "not_confirmed"
    assert failed["recommended_grade"] == "intern"


def test_platform_test_builds_profile_without_fsp_history() -> None:
    skills = {
        "algorithms": Skill("algorithms", "Алгоритмы", "Backend"),
        "python": Skill("python", "Python", "Backend", ("algorithms",)),
    }
    signals = {
        "algorithms": (0.48, 0.80, "test:one"),
        "python": (0.48, 0.80, "test:one"),
    }
    vacancy = Vacancy(
        "junior", "Компания", "Junior backend", "Junior", "remote", 100000, 150000,
        (Requirement("algorithms", 0.4, 4), Requirement("python", 0.4, 5)),
    )

    profile = build_profile("candidate", skills, {}, [], test_signals=signals)
    matched = match_candidate("candidate", vacancy, skills, {}, [], signals)

    assert profile.categories == ("Backend",)
    assert matched.score > 0
    assert matched.critical_gaps == 0


def test_failed_grade_stays_unverified_then_lower_grade_can_be_confirmed(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "assessment.sqlite3")) as http:
        authenticated_client(http, "candidate@example.test", "candidate")
        candidate_profile(http, visible=True)

        assert http.post("/api/v1/assessments/start", json={"target_grade": "middle"}).status_code == 409
        attempt = http.post("/api/v1/assessments/start", json={"target_grade": "junior"}).json()
        wrong = {
            item["id"]: (QUESTION_BY_ID[item["id"]].correct_index + 1) % len(item["options"])
            for item in attempt["questions"]
        }
        failed = http.post(
            f"/api/v1/assessments/{attempt['id']}/submit", json={"answers": wrong},
        )
        assert failed.status_code == 200
        assert failed.json()["passed"] is False
        assert http.get("/api/v1/account/profile").json()["profile"]["verified_grade"] is None

        lower = http.post("/api/v1/assessments/start", json={"target_grade": "intern"}).json()
        correct = {item["id"]: QUESTION_BY_ID[item["id"]].correct_index for item in lower["questions"]}
        passed = http.post(
            f"/api/v1/assessments/{lower['id']}/submit", json={"answers": correct},
        )
        assert passed.json()["category"] == "backend:intern"
        profile = http.get("/api/v1/account/profile").json()["profile"]
        assert profile["verified_grade"] == "intern"
        assert http.post("/api/v1/assessments/start", json={"target_grade": "junior"}).status_code == 409

        public_candidate = next(
            item for item in http.get("/api/v1/candidates").json() if item["id"] == profile["candidate_id"]
        )
        assert public_candidate["tested_category"] == "backend:intern"
        assert public_candidate["has_fsp_history"] is False
        matches = http.get("/api/v1/vacancies/backend-platform/matches").json()
        own_match = next(item for item in matches if item["id"] == profile["candidate_id"])
        assert own_match["match"]["score"] > 0


def test_assessment_requires_profile_and_exact_answers(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "assessment.sqlite3")) as http:
        authenticated_client(http, "candidate@example.test", "candidate")
        assert http.post("/api/v1/assessments/start", json={"target_grade": "junior"}).status_code == 409
        candidate_profile(http)
        attempt = http.post("/api/v1/assessments/start", json={"target_grade": "junior"}).json()
        response = http.post(
            f"/api/v1/assessments/{attempt['id']}/submit",
            json={"answers": {attempt["questions"][0]["id"]: 0}},
        )
        assert response.status_code == 422
