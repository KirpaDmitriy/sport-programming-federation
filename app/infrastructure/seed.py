from datetime import date

from app.domain.models import (
    Achievement,
    Competition,
    EvidencePolicy,
    EvidencePolicyMode,
    Requirement,
    Skill,
    Vacancy,
)

from .database import Store
from .fsp import sync_fsp_payload


SKILLS = (
    Skill("algorithms", "Алгоритмы и структуры данных", "Backend"),
    Skill("python", "Python", "Backend", ("algorithms",)),
    Skill("cpp", "C++", "Системная разработка", ("algorithms",)),
    Skill("databases", "Базы данных", "Backend"),
    Skill("distributed", "Распределённые системы", "Backend", ("databases",)),
    Skill("ml", "Машинное обучение", "AI / ML", ("python",)),
    Skill("data", "Анализ данных", "AI / ML", ("python",)),
    Skill("security", "Информационная безопасность", "Кибербезопасность"),
    Skill("product", "Продуктовое мышление", "Product Engineering"),
    Skill("teamwork", "Командная разработка", "Product Engineering"),
)

FSP_DEMO_PAYLOAD = {
    "disciplines": [
        {"id": "algo", "name": "Алгоритмическое программирование"},
        {"id": "product", "name": "Продуктовое программирование"},
        {"id": "security", "name": "Программирование систем информационной безопасности"},
    ],
    "participants": [
        {
            "id": "alina",
            "name": "Алина Воронова",
            "city": "Москва",
            "work_format": "hybrid",
            "desired_role": "ML-инженер",
            "about": "Строю модели и умею доводить их до работающего продукта.",
            "stack": ["Python", "PyTorch", "SQL"],
        },
        {
            "id": "maksim",
            "name": "Максим Орлов",
            "city": "Санкт-Петербург",
            "work_format": "remote",
            "desired_role": "Backend-разработчик",
            "about": "Люблю высокую нагрузку, понятные контракты и сложные алгоритмы.",
            "stack": ["Go", "C++", "PostgreSQL"],
        },
        {
            "id": "sofia",
            "name": "Софья Ким",
            "city": "Казань",
            "work_format": "hybrid",
            "desired_role": "Product engineer",
            "about": "Соединяю разработку, продукт и командную работу.",
            "stack": ["TypeScript", "Python", "React"],
        },
        {
            "id": "timur",
            "name": "Тимур Сафин",
            "city": "Уфа",
            "work_format": "remote",
            "desired_role": "Security engineer",
            "about": "Исследую уязвимости и автоматизирую защиту инфраструктуры.",
            "stack": ["Python", "C", "Linux"],
        },
        {
            "id": "daria",
            "name": "Дарья Белова",
            "city": "Новосибирск",
            "work_format": "office",
            "desired_role": "Data scientist",
            "about": "Ищу закономерности в данных и проверяю гипотезы кодом.",
            "stack": ["Python", "Pandas", "CatBoost"],
        },
    ],
    "competitions": [
        {
            "id": "fsp-algo-final-2026",
            "name": "Финал Кубка России 2026",
            "discipline_id": "algo",
            "participants": 640,
            "difficulty": 0.94,
            "official": True,
            "skills": {"algorithms": 1.0, "cpp": 0.86, "python": 0.58},
        },
        {
            "id": "fsp-product-2026",
            "name": "Чемпионат по продуктовому программированию",
            "discipline_id": "product",
            "participants": 420,
            "difficulty": 0.82,
            "official": True,
            "skills": {"product": 1.0, "teamwork": 0.92, "python": 0.45, "databases": 0.52},
        },
        {
            "id": "fsp-sec-2026",
            "name": "Кубок по информационной безопасности",
            "discipline_id": "security",
            "participants": 260,
            "difficulty": 0.9,
            "official": True,
            "skills": {"security": 1.0, "python": 0.48, "teamwork": 0.62},
        },
        {
            "id": "fsp-algo-open-2027",
            "name": "Открытый чемпионат ФСП 2027",
            "discipline_id": "algo",
            "participants": 900,
            "difficulty": 0.88,
            "official": True,
            "skills": {"algorithms": 1.0, "cpp": 0.82, "python": 0.55},
            "starts_on": "2027-02-14",
        },
        {
            "id": "fsp-product-cup-2027",
            "name": "Кубок продуктовых команд 2027",
            "discipline_id": "product",
            "participants": 520,
            "difficulty": 0.8,
            "official": True,
            "skills": {"product": 1.0, "teamwork": 0.95, "databases": 0.5},
            "starts_on": "2027-03-20",
        },
    ],
    "results": [
        {"id": "r1", "participant_id": "alina", "competition_id": "fsp-product-2026", "placement": 8, "participants": 420, "role": "analyst", "rank": "КМС"},
        {"id": "r2", "participant_id": "maksim", "competition_id": "fsp-algo-final-2026", "placement": 3, "participants": 640, "role": "captain", "rank": "МС"},
        {"id": "r3", "participant_id": "sofia", "competition_id": "fsp-product-2026", "placement": 2, "participants": 420, "role": "captain", "rank": "КМС"},
        {"id": "r4", "participant_id": "timur", "competition_id": "fsp-sec-2026", "placement": 1, "participants": 260, "role": "captain", "rank": "МС"},
        {"id": "r5", "participant_id": "daria", "competition_id": "fsp-product-2026", "placement": 19, "participants": 420, "role": "analyst", "rank": "I"},
        {"id": "r6", "participant_id": "alina", "competition_id": "fsp-algo-final-2026", "placement": 41, "participants": 640, "role": "developer", "rank": "I"},
        {"id": "r7", "participant_id": "maksim", "competition_id": "fsp-product-2026", "placement": 24, "participants": 420, "role": "developer", "rank": "КМС"},
    ],
}

EXTERNAL_COMPETITIONS = (
    Competition(
        "ml-challenge-2026", "National ML Challenge", "Data science", "hackathon", 780, 0.86, False,
        {"ml": 1.0, "data": 0.94, "python": 0.82, "product": 0.35},
    ),
    Competition(
        "codeforces-round", "Codeforces Round", "Алгоритмическое программирование", "codeforces", 8300,
        0.78, False, {"algorithms": 1.0, "cpp": 0.8},
    ),
    Competition(
        "ml-challenge-2027", "National ML Challenge 2027", "Data science", "hackathon", 1000, 0.9,
        False, {"ml": 1.0, "data": 0.95, "python": 0.8}, date(2027, 4, 18),
    ),
    Competition(
        "backend-cup-2027", "Backend Cup 2027", "Высоконагруженные системы", "hackathon", 600, 0.86,
        False, {"distributed": 1.0, "databases": 0.86, "python": 0.5, "teamwork": 0.55}, date(2027, 5, 12),
    ),
)

EXTERNAL_RESULTS = (
    Achievement("hack:ml-11", "alina", "ml-challenge-2026", "hackathon", "ml-11", 4, 780, "developer"),
    Achievement("hack:ml-28", "daria", "ml-challenge-2026", "hackathon", "ml-28", 11, 780, "analyst"),
    Achievement("cf:max-1", "maksim", "codeforces-round", "codeforces", "max-1", 57, 8300, "participant"),
    Achievement("cf:alina-1", "alina", "codeforces-round", "codeforces", "alina-1", 420, 8300, "participant"),
)

VACANCIES = (
    Vacancy(
        "backend-platform", "Квант", "Backend-разработчик платформы", "Middle+", "hybrid", 220_000, 320_000,
        (
            Requirement("algorithms", 0.72, 4),
            Requirement("databases", 0.62, 5),
            Requirement("distributed", 0.58, 5),
            Requirement("teamwork", 0.5, 3),
        ),
    ),
    Vacancy(
        "ml-engineer", "Спектр AI", "ML-инженер рекомендательных систем", "Middle", "remote", 240_000, 350_000,
        (
            Requirement("python", 0.72, 5),
            Requirement("ml", 0.76, 5),
            Requirement("data", 0.68, 4),
            Requirement("product", 0.48, 2),
        ),
    ),
    Vacancy(
        "security-engineer", "Север Тех", "Инженер по безопасности", "Middle", "office", 200_000, 290_000,
        (
            Requirement("security", 0.78, 5),
            Requirement("python", 0.5, 3),
            Requirement("teamwork", 0.5, 3),
        ),
        EvidencePolicy(
            EvidencePolicyMode.ALLOWLIST,
            frozenset({"fsp-sec-2026", "fsp-algo-final-2026", "fsp-algo-open-2027"}),
        ),
    ),
)


def seed_store(store: Store) -> None:
    store.initialize()
    store.upsert_skills(SKILLS)
    sync_fsp_payload(store, FSP_DEMO_PAYLOAD)
    store.upsert_competitions(EXTERNAL_COMPETITIONS)
    store.upsert_achievements(EXTERNAL_RESULTS)
    store.upsert_vacancies(VACANCIES)
