from datetime import date

import pytest

from app.domain.models import (
    Achievement,
    Competition,
    EvidencePolicy,
    EvidencePolicyMode,
    Requirement,
    Skill,
    Vacancy,
)
from app.domain.scoring import build_profile, competition_quality, match_candidate, recommend_competitions


SKILLS = {
    "algorithms": Skill("algorithms", "Алгоритмы", "Backend"),
    "python": Skill("python", "Python", "Backend", ("algorithms",)),
    "ml": Skill("ml", "Машинное обучение", "AI/ML", ("python",)),
}

COMPETITIONS = {
    "fsp-final": Competition(
        "fsp-final",
        "Финал ФСП",
        "Алгоритмическое программирование",
        "fsp",
        600,
        0.9,
        True,
        {"algorithms": 1.0, "python": 0.7},
    ),
    "ml-cup": Competition(
        "ml-cup",
        "ML Cup",
        "Продуктовое программирование",
        "hackathon",
        180,
        0.72,
        False,
        {"ml": 1.0, "python": 0.8},
        date(2027, 3, 1),
    ),
}


def achievement(identifier: str, competition: str, place: int, participants: int = 100) -> Achievement:
    return Achievement(identifier, "candidate-1", competition, "fsp", identifier, place, participants, "developer", "КМС")


def vacancy(policy: EvidencePolicy | None = None) -> Vacancy:
    return Vacancy(
        "vacancy-1",
        "ТехноЛаб",
        "Backend-разработчик",
        "Middle",
        "hybrid",
        180_000,
        260_000,
        (Requirement("algorithms", 0.7, 5), Requirement("python", 0.65, 4)),
        policy or EvidencePolicy(),
    )


def test_stronger_result_produces_higher_match() -> None:
    winner = match_candidate("candidate-1", vacancy(), SKILLS, COMPETITIONS, [achievement("gold", "fsp-final", 1)])
    finalist = match_candidate("candidate-1", vacancy(), SKILLS, COMPETITIONS, [achievement("finalist", "fsp-final", 40)])

    assert 0 <= finalist.score < winner.score <= 100
    assert winner.profile.categories == ("Backend",)


def test_allowlist_removes_unaccepted_evidence() -> None:
    results = [achievement("gold", "fsp-final", 1)]
    platform = match_candidate("candidate-1", vacancy(), SKILLS, COMPETITIONS, results)
    restricted = match_candidate(
        "candidate-1",
        vacancy(EvidencePolicy(EvidencePolicyMode.ALLOWLIST, frozenset({"ml-cup"}))),
        SKILLS,
        COMPETITIONS,
        results,
    )

    assert restricted.score == 0
    assert restricted.score < platform.score
    assert restricted.critical_gaps == 2


def test_complete_coverage_beats_strong_profile_with_a_critical_gap() -> None:
    balanced_results = [achievement("balanced", "fsp-final", 10)]
    algorithms_only = {
        "algorithm-open": Competition(
            "algorithm-open",
            "Algorithm Open",
            "Алгоритмическое программирование",
            "fsp",
            1000,
            1.0,
            True,
            {"algorithms": 1.0},
        )
    }
    specialist = [achievement("specialist", "algorithm-open", 1)]

    balanced = match_candidate("candidate-1", vacancy(), SKILLS, COMPETITIONS, balanced_results)
    gapped = match_candidate("candidate-1", vacancy(), SKILLS, algorithms_only, specialist)

    assert balanced.critical_gaps == 0
    assert gapped.critical_gaps == 1
    assert balanced.score > gapped.score


def test_independent_evidence_increases_confidence_without_exceeding_one() -> None:
    first = build_profile("candidate-1", SKILLS, COMPETITIONS, [achievement("a", "fsp-final", 10)])
    repeated = build_profile(
        "candidate-1",
        SKILLS,
        COMPETITIONS,
        [achievement("a", "fsp-final", 10), achievement("b", "fsp-final", 12)],
    )

    assert first.skills["algorithms"].confidence < repeated.skills["algorithms"].confidence <= 1
    assert first.skills["algorithms"].level <= repeated.skills["algorithms"].level <= 1


@pytest.mark.parametrize(
    ("participants", "difficulty", "expected_range"),
    [
        (0, -2.0, (0.44, 0.46)),
        (10_000_000, 8.0, (0.99, 1.0)),
    ],
)
def test_competition_quality_clamps_malformed_ranges(participants, difficulty, expected_range) -> None:
    competition = Competition("x", "X", "X", "fsp", participants, difficulty, True, {"ml": 5.0})
    quality = competition_quality(competition, "ml")
    assert expected_range[0] <= quality <= expected_range[1]


def test_recommendations_target_weighted_gap_and_skip_past_events() -> None:
    match = match_candidate("candidate-1", vacancy(), SKILLS, COMPETITIONS, [])
    recommendations = recommend_competitions(match, vacancy(), COMPETITIONS, date(2026, 10, 5))

    assert [item.competition_id for item in recommendations] == ["ml-cup"]
    assert recommendations[0].closes_skills == ("python",)
