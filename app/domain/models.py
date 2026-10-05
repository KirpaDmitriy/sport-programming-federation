from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class EvidencePolicyMode(StrEnum):
    PLATFORM_RATING = "platform_rating"
    ALLOWLIST = "allowlist"


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    category: str
    prerequisites: tuple[str, ...] = ()


@dataclass(frozen=True)
class Competition:
    id: str
    name: str
    discipline: str
    source: str
    participants: int
    difficulty: float
    official: bool
    skill_relevance: dict[str, float]
    starts_on: date | None = None


@dataclass(frozen=True)
class Achievement:
    id: str
    candidate_id: str
    competition_id: str
    source: str
    external_id: str
    placement: int
    participants: int
    role: str
    rank: str | None = None


@dataclass(frozen=True)
class Candidate:
    id: str
    name: str
    city: str
    work_format: str
    desired_role: str
    about: str
    stack: tuple[str, ...] = ()


@dataclass(frozen=True)
class Requirement:
    skill_id: str
    level: float
    criticality: int


@dataclass(frozen=True)
class EvidencePolicy:
    mode: EvidencePolicyMode = EvidencePolicyMode.PLATFORM_RATING
    competition_ids: frozenset[str] = field(default_factory=frozenset)


@dataclass(frozen=True)
class Vacancy:
    id: str
    employer: str
    title: str
    grade: str
    work_format: str
    salary_from: int
    salary_to: int
    requirements: tuple[Requirement, ...]
    evidence_policy: EvidencePolicy = field(default_factory=EvidencePolicy)


@dataclass(frozen=True)
class SkillAssessment:
    skill_id: str
    level: float
    confidence: float
    evidence_ids: tuple[str, ...]


@dataclass(frozen=True)
class Profile:
    candidate_id: str
    skills: dict[str, SkillAssessment]
    categories: tuple[str, ...]
    verified_level: str


@dataclass(frozen=True)
class Gap:
    skill_id: str
    required_level: float
    confirmed_level: float
    deficit: float
    criticality: int


@dataclass(frozen=True)
class Match:
    candidate_id: str
    vacancy_id: str
    score: float
    coverage: float
    critical_gaps: int
    gaps: tuple[Gap, ...]
    profile: Profile
