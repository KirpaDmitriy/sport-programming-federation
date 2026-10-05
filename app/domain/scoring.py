import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from .models import (
    Achievement,
    Competition,
    EvidencePolicy,
    EvidencePolicyMode,
    Gap,
    Match,
    Profile,
    Skill,
    SkillAssessment,
    Vacancy,
)


SOURCE_RELIABILITY = {
    "fsp": 0.98,
    "codeforces": 0.88,
    "hackathon": 0.82,
}

RANK_BONUS = {
    "III": 0.03,
    "II": 0.05,
    "I": 0.07,
    "КМС": 0.10,
    "МС": 0.13,
}

ROLE_BONUS = {
    "participant": 0.0,
    "developer": 0.02,
    "analyst": 0.02,
    "captain": 0.04,
}


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def competition_quality(competition: Competition, skill_id: str) -> float:
    mass = clamp(math.log1p(max(competition.participants, 0)) / math.log1p(5000))
    difficulty = clamp(competition.difficulty)
    relevance = clamp(competition.skill_relevance.get(skill_id, 0.0))
    official = 1.0 if competition.official else 0.55
    return clamp(0.25 * mass + 0.30 * difficulty + 0.20 * relevance + 0.25 * official)


def _achievement_signal(
    achievement: Achievement,
    competition: Competition,
    skill_id: str,
) -> tuple[float, float]:
    participants = max(achievement.participants, achievement.placement, 1)
    percentile = 1.0 - (achievement.placement - 1) / participants
    relevance = clamp(competition.skill_relevance.get(skill_id, 0.0))
    base_level = 0.55 * percentile + 0.25 * clamp(competition.difficulty) + 0.20 * relevance
    level = clamp(
        base_level
        + RANK_BONUS.get(achievement.rank or "", 0.0)
        + ROLE_BONUS.get(achievement.role, 0.0)
    )
    source = SOURCE_RELIABILITY.get(achievement.source, 0.65)
    confidence = clamp(source * competition_quality(competition, skill_id))
    return level, confidence


def _allowed(competition_id: str, policy: EvidencePolicy) -> bool:
    return (
        policy.mode == EvidencePolicyMode.PLATFORM_RATING
        or competition_id in policy.competition_ids
    )


def build_profile(
    candidate_id: str,
    skills: dict[str, Skill],
    competitions: dict[str, Competition],
    achievements: list[Achievement],
    policy: EvidencePolicy | None = None,
) -> Profile:
    active_policy = policy or EvidencePolicy()
    signals: dict[str, list[tuple[float, float, str]]] = defaultdict(list)

    for achievement in achievements:
        if achievement.candidate_id != candidate_id:
            continue
        competition = competitions.get(achievement.competition_id)
        if competition is None or not _allowed(competition.id, active_policy):
            continue
        for skill_id, relevance in competition.skill_relevance.items():
            if skill_id not in skills or relevance <= 0:
                continue
            level, confidence = _achievement_signal(achievement, competition, skill_id)
            signals[skill_id].append((level, confidence, achievement.id))

    assessments: dict[str, SkillAssessment] = {}
    for skill_id, skill_signals in signals.items():
        ordered = sorted(skill_signals, key=lambda item: (item[0], item[1]), reverse=True)
        strongest = ordered[0][0]
        confirmation = 1.0 - math.prod(1.0 - level * confidence for level, confidence, _ in ordered[1:])
        level = clamp(strongest + (1.0 - strongest) * 0.18 * confirmation)
        confidence = clamp(1.0 - math.prod(1.0 - item[1] for item in ordered))
        assessments[skill_id] = SkillAssessment(
            skill_id=skill_id,
            level=round(level, 4),
            confidence=round(confidence, 4),
            evidence_ids=tuple(item[2] for item in ordered),
        )

    category_values: dict[str, list[float]] = defaultdict(list)
    for skill_id, assessment in assessments.items():
        category_values[skills[skill_id].category].append(assessment.level * assessment.confidence)
    category_scores = {
        category: sum(values) / len(values)
        for category, values in category_values.items()
    }
    categories = tuple(
        category
        for category, score in sorted(category_scores.items(), key=lambda item: (-item[1], item[0]))
        if score >= 0.35
    )
    peak = max(category_scores.values(), default=0.0)
    verified_level = "advanced" if peak >= 0.72 else "confident" if peak >= 0.50 else "growing"
    return Profile(candidate_id, assessments, categories, verified_level)


def match_candidate(
    candidate_id: str,
    vacancy: Vacancy,
    skills: dict[str, Skill],
    competitions: dict[str, Competition],
    achievements: list[Achievement],
) -> Match:
    profile = build_profile(
        candidate_id,
        skills,
        competitions,
        achievements,
        vacancy.evidence_policy,
    )
    weighted_coverage = 0.0
    weighted_strength = 0.0
    total_weight = 0
    gaps: list[Gap] = []
    for requirement in vacancy.requirements:
        assessment = profile.skills.get(requirement.skill_id)
        confirmed = 0.0
        if assessment:
            confirmed = assessment.level * (0.55 + 0.45 * assessment.confidence)
        required = max(requirement.level, 0.01)
        coverage = clamp(confirmed / required)
        weighted_coverage += coverage * requirement.criticality
        weighted_strength += confirmed * requirement.criticality
        total_weight += requirement.criticality
        if confirmed < requirement.level:
            gaps.append(
                Gap(
                    skill_id=requirement.skill_id,
                    required_level=round(requirement.level, 4),
                    confirmed_level=round(confirmed, 4),
                    deficit=round(requirement.level - confirmed, 4),
                    criticality=requirement.criticality,
                )
            )
    coverage = weighted_coverage / total_weight if total_weight else 0.0
    strength = weighted_strength / total_weight if total_weight else 0.0
    critical_gaps = sum(gap.criticality >= 4 for gap in gaps)
    score = 100.0 * (0.85 * coverage + 0.15 * strength) * (0.94**critical_gaps)
    return Match(
        candidate_id=candidate_id,
        vacancy_id=vacancy.id,
        score=round(clamp(score, 0.0, 100.0), 1),
        coverage=round(coverage, 4),
        critical_gaps=critical_gaps,
        gaps=tuple(sorted(gaps, key=lambda gap: (-gap.criticality, -gap.deficit, gap.skill_id))),
        profile=profile,
    )


@dataclass(frozen=True)
class CompetitionRecommendation:
    competition_id: str
    score: float
    closes_skills: tuple[str, ...]


def recommend_competitions(
    match: Match,
    vacancy: Vacancy,
    competitions: dict[str, Competition],
    today: date,
) -> tuple[CompetitionRecommendation, ...]:
    allowed_ids = vacancy.evidence_policy.competition_ids
    recommendations: list[CompetitionRecommendation] = []
    for competition in competitions.values():
        if competition.starts_on is None or competition.starts_on < today:
            continue
        if vacancy.evidence_policy.mode == EvidencePolicyMode.ALLOWLIST and competition.id not in allowed_ids:
            continue
        weighted_gain = 0.0
        closes: list[str] = []
        for gap in match.gaps:
            relevance = clamp(competition.skill_relevance.get(gap.skill_id, 0.0))
            if relevance == 0:
                continue
            weighted_gain += gap.deficit * gap.criticality * relevance
            closes.append(gap.skill_id)
        if closes:
            quality = sum(competition_quality(competition, skill_id) for skill_id in closes) / len(closes)
            recommendations.append(
                CompetitionRecommendation(
                    competition_id=competition.id,
                    score=round(weighted_gain * quality, 4),
                    closes_skills=tuple(sorted(closes)),
                )
            )
    return tuple(sorted(recommendations, key=lambda item: (-item.score, item.competition_id)))
