from dataclasses import asdict
from datetime import date

from app.domain.models import Candidate, Vacancy
from app.domain.graph import comparison_graph
from app.domain.scoring import build_profile, match_candidate, recommend_competitions
from app.infrastructure.database import Store


class TalentService:
    def __init__(self, store: Store):
        self.store = store

    def catalog(self) -> dict:
        return {
            "skills": [asdict(item) for item in self.store.skills().values()],
            "competitions": [asdict(item) for item in self.store.competitions().values()],
        }

    def vacancies(self) -> list[dict]:
        return [
            {**asdict(item), "accepts_applications": self.store.vacancy_owner(item.id) is not None}
            for item in self.store.vacancies()
        ]

    def save_vacancy(self, vacancy: Vacancy, owner_user_id: str | None = None) -> dict:
        self.store.upsert_vacancies([vacancy], owner_user_id)
        return asdict(vacancy)

    def candidates(
        self,
        category: str | None = None,
        work_format: str | None = None,
        specialization: str | None = None,
        grade: str | None = None,
        stack: str | None = None,
        has_fsp: bool | None = None,
    ) -> list[dict]:
        skills = self.store.skills()
        competitions = self.store.competitions()
        achievements = self.store.achievements()
        result = []
        for candidate in self.store.candidates():
            test_signals = self.store.test_skill_signals(candidate.id)
            profile = build_profile(candidate.id, skills, competitions, achievements, test_signals=test_signals)
            account = self.store.candidate_profile_by_candidate(candidate.id)
            tested_category = None
            if account:
                tested_category = f"{account['specialization']}:{account['verified_grade'] or 'unverified'}"
            if category and category not in profile.categories and category != tested_category:
                continue
            if work_format and candidate.work_format != work_format:
                continue
            if specialization and (not account or account["specialization"].casefold() != specialization.casefold()):
                continue
            if grade and (not account or (account["verified_grade"] or account["claimed_grade"]).casefold() != grade.casefold()):
                continue
            if stack and not any(stack.casefold() in item.casefold() for item in candidate.stack):
                continue
            candidate_has_fsp = any(
                item.source == "fsp" for item in achievements if item.candidate_id == candidate.id
            )
            if has_fsp is not None and candidate_has_fsp != has_fsp:
                continue
            result.append({
                **asdict(candidate),
                "profile": asdict(profile),
                "tested_category": tested_category,
                "verified_grade": account["verified_grade"] if account else None,
                "has_fsp_history": candidate_has_fsp,
            })
        return result

    def candidate_detail(self, candidate_id: str, vacancy_id: str | None = None) -> dict | None:
        candidate = self.store.candidate(candidate_id)
        if candidate is None:
            return None
        skills = self.store.skills()
        competitions = self.store.competitions()
        achievements = self.store.achievements(candidate_id)
        test_signals = self.store.test_skill_signals(candidate.id)
        profile = build_profile(candidate.id, skills, competitions, achievements, test_signals=test_signals)
        account = self.store.candidate_profile_by_candidate(candidate.id)
        evidence = []
        for achievement in achievements:
            competition = competitions[achievement.competition_id]
            evidence.append({
                **asdict(achievement),
                "competition": competition.name,
                "discipline": competition.discipline,
                "official": competition.official,
            })
        vacancy = self.store.vacancy(vacancy_id) if vacancy_id else None
        match = (
            match_candidate(candidate.id, vacancy, skills, competitions, achievements, test_signals)
            if vacancy else None
        )
        result = {
            **asdict(candidate),
            "profile": asdict(profile),
            "evidence": evidence,
            "graph": comparison_graph(skills, profile, vacancy, match),
            "tested_category": (
                f"{account['specialization']}:{account['verified_grade'] or 'unverified'}"
                if account else None
            ),
            "verified_grade": account["verified_grade"] if account else None,
            "has_fsp_history": any(item.source == "fsp" for item in achievements),
        }
        if vacancy and match:
            result["match"] = asdict(match)
            result["recommendations"] = [
                asdict(item)
                for item in recommend_competitions(match, vacancy, competitions, date.today())
            ]
        return result

    def matches(self, vacancy_id: str, category: str | None = None) -> list[dict] | None:
        vacancy = self.store.vacancy(vacancy_id)
        if vacancy is None:
            return None
        skills = self.store.skills()
        competitions = self.store.competitions()
        achievements = self.store.achievements()
        candidates: list[tuple[Candidate, dict]] = []
        for candidate in self.store.candidates():
            test_signals = self.store.test_skill_signals(candidate.id)
            match = match_candidate(
                candidate.id, vacancy, skills, competitions, achievements, test_signals,
            )
            account = self.store.candidate_profile_by_candidate(candidate.id)
            tested_category = None
            if account:
                tested_category = f"{account['specialization']}:{account['verified_grade'] or 'unverified'}"
            if category and category not in match.profile.categories and category != tested_category:
                continue
            candidates.append((candidate, {
                **asdict(candidate),
                "match": asdict(match),
                "tested_category": tested_category,
                "verified_grade": account["verified_grade"] if account else None,
                "has_fsp_history": any(
                    item.source == "fsp" for item in achievements if item.candidate_id == candidate.id
                ),
            }))
        return [item for _, item in sorted(candidates, key=lambda pair: (-pair[1]["match"]["score"], pair[0].name))]
