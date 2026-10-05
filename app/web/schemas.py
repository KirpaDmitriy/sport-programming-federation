from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.domain.models import EvidencePolicy, EvidencePolicyMode, Requirement, Vacancy


UnitInterval = Annotated[float, Field(ge=0, le=1)]


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    password: str = Field(min_length=10, max_length=128)
    role: Literal["candidate", "employer"]
    display_name: str = Field(min_length=2, max_length=120)


class VerifyEmailIn(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    code: str = Field(pattern=r"^\d{6}$")


class LoginIn(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    password: str = Field(min_length=1, max_length=128)


class CandidateProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    work_format: Literal["remote", "hybrid", "office"]
    desired_role: str = Field(min_length=2, max_length=120)
    about: str = Field(min_length=10, max_length=2000)
    stack: list[str] = Field(min_length=1, max_length=30)
    industry: str = Field(min_length=2, max_length=120)
    specialization: str = Field(min_length=2, max_length=120)
    claimed_grade: Literal["intern", "junior", "middle", "senior"]
    fsp_id: str | None = Field(default=None, max_length=120)
    contact_email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    years_experience: int = Field(ge=0, le=70)
    roles: list[str] = Field(default_factory=list, max_length=20)
    soft_skills: list[str] = Field(default_factory=list, max_length=30)
    profile_visible: bool = False
    consent_processing: bool
    consent_publication: bool = False

    @model_validator(mode="after")
    def publication_requires_processing_consent(self):
        if (self.profile_visible or self.consent_publication) and not self.consent_processing:
            raise ValueError("visible profile requires processing consent")
        return self


class EmployerProfileIn(BaseModel):
    company_name: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=2000)
    industry: str = Field(min_length=2, max_length=120)
    contact_method: str = Field(min_length=5, max_length=254)


class AssessmentStartIn(BaseModel):
    target_grade: Literal["intern", "junior", "middle", "senior"]


class AssessmentSubmitIn(BaseModel):
    answers: dict[str, int] = Field(min_length=1, max_length=20)


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
        skill_ids = [item.skill_id for item in self.requirements]
        if len(skill_ids) != len(set(skill_ids)):
            raise ValueError("requirements must contain unique skills")
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
