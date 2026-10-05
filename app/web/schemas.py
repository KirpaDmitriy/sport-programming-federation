from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.domain.models import EvidencePolicy, EvidencePolicyMode, Requirement, Vacancy


UnitInterval = Annotated[float, Field(ge=0, le=1)]


class RequirementIn(BaseModel):
    skill_id: str = Field(min_length=1)
    level: UnitInterval
    criticality: int = Field(ge=1, le=5)


class EvidencePolicyIn(BaseModel):
    mode: EvidencePolicyMode = EvidencePolicyMode.PLATFORM_RATING
    competition_ids: set[str] = set()


class VacancyIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]+$")
    employer: str = Field(min_length=2, max_length=100)
    title: str = Field(min_length=3, max_length=120)
    grade: str = Field(min_length=2, max_length=30)
    work_format: Literal["remote", "hybrid", "office"]
    salary_from: int = Field(gt=0)
    salary_to: int = Field(gt=0)
    requirements: list[RequirementIn] = Field(min_length=1)
    evidence_policy: EvidencePolicyIn = EvidencePolicyIn()

    @model_validator(mode="after")
    def salary_range_is_ordered(self):
        if self.salary_to < self.salary_from:
            raise ValueError("salary_to must be greater than or equal to salary_from")
        if self.evidence_policy.mode == EvidencePolicyMode.ALLOWLIST and not self.evidence_policy.competition_ids:
            raise ValueError("allowlist policy requires at least one competition")
        return self

    def domain(self) -> Vacancy:
        return Vacancy(
            self.id,
            self.employer,
            self.title,
            self.grade,
            self.work_format,
            self.salary_from,
            self.salary_to,
            tuple(Requirement(item.skill_id, item.level, item.criticality) for item in self.requirements),
            EvidencePolicy(self.evidence_policy.mode, frozenset(self.evidence_policy.competition_ids)),
        )


class OfferIn(BaseModel):
    candidate_id: str = Field(min_length=1)
    vacancy_id: str = Field(min_length=1)
    salary_from: int = Field(gt=0)
    salary_to: int = Field(gt=0)
    message: str = Field(min_length=10, max_length=1000)

    @model_validator(mode="after")
    def salary_range_is_ordered(self):
        if self.salary_to < self.salary_from:
            raise ValueError("salary_to must be greater than or equal to salary_from")
        return self


class FspDisciplineIn(BaseModel):
    id: str
    name: str


class FspParticipantIn(BaseModel):
    id: str
    name: str
    city: str = "Не указан"
    work_format: str = "remote"
    desired_role: str = "ИТ-специалист"
    about: str = "Профиль импортирован из ФСП"
    stack: list[str] = []


class FspCompetitionIn(BaseModel):
    id: str
    name: str
    discipline_id: str
    participants: int = Field(ge=1)
    difficulty: UnitInterval
    official: bool = True
    skills: dict[str, UnitInterval]
    starts_on: str | None = None


class FspResultIn(BaseModel):
    id: str
    participant_id: str
    competition_id: str
    placement: int = Field(ge=1)
    participants: int = Field(ge=1)
    role: str
    rank: str | None = None


class FspPayloadIn(BaseModel):
    disciplines: list[FspDisciplineIn]
    participants: list[FspParticipantIn]
    competitions: list[FspCompetitionIn]
    results: list[FspResultIn]
