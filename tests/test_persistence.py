import sqlite3

import pytest

from app.infrastructure.database import Store
from app.infrastructure.fsp import sync_fsp_payload
from app.infrastructure.seed import FSP_DEMO_PAYLOAD, SKILLS, seed_store


def test_seed_and_repeated_sync_are_idempotent(tmp_path) -> None:
    store = Store(tmp_path / "test.sqlite3")
    seed_store(store)
    before = {table: store.count(table) for table in ("skills", "competitions", "candidates", "achievements", "vacancies")}

    result = sync_fsp_payload(store, FSP_DEMO_PAYLOAD)
    after = {table: store.count(table) for table in before}

    assert result == {"disciplines": 3, "competitions": 5, "participants": 5, "results": 7}
    assert after == before
    achievement = next(item for item in store.achievements() if item.external_id == "r2")
    assert (achievement.role, achievement.rank) == ("captain", "МС")


def test_relations_survive_round_trip(tmp_path) -> None:
    store = Store(tmp_path / "test.sqlite3")
    seed_store(store)

    skills = store.skills()
    competitions = store.competitions()
    vacancy = store.vacancy("backend-platform")

    assert skills["python"].prerequisites == ("algorithms",)
    assert competitions["fsp-algo-final-2026"].discipline == "Алгоритмическое программирование"
    assert vacancy is not None
    assert vacancy.requirements[1].skill_id == "databases"


def test_database_rejects_impossible_placement(tmp_path) -> None:
    store = Store(tmp_path / "test.sqlite3")
    store.initialize()
    store.upsert_skills(SKILLS)
    malformed = dict(FSP_DEMO_PAYLOAD)
    malformed["results"] = [dict(FSP_DEMO_PAYLOAD["results"][0], placement=0)]

    with pytest.raises(sqlite3.IntegrityError):
        sync_fsp_payload(store, malformed)


def test_failed_sync_rolls_back_the_whole_payload(tmp_path) -> None:
    store = Store(tmp_path / "test.sqlite3")
    store.initialize()
    store.upsert_skills(SKILLS)
    malformed = {
        "disciplines": [{"id": "algo", "name": "Алгоритмы"}],
        "participants": [{"id": "new-person", "name": "Новый участник"}],
        "competitions": [{
            "id": "new-event",
            "name": "Новое соревнование",
            "discipline_id": "algo",
            "participants": 10,
            "difficulty": 0.5,
            "skills": {"algorithms": 1.0},
        }],
        "results": [{
            "id": "broken-result",
            "participant_id": "new-person",
            "competition_id": "new-event",
            "placement": 0,
            "participants": 10,
            "role": "participant",
        }],
    }

    with pytest.raises(sqlite3.IntegrityError):
        sync_fsp_payload(store, malformed)

    assert store.count("candidates") == 0
    assert store.count("competitions") == 0
