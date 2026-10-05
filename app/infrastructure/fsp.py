from datetime import date

from app.domain.models import Achievement, Candidate, Competition

from .database import Store


def sync_fsp_payload(store: Store, payload: dict) -> dict[str, int]:
    disciplines = {item["id"]: item["name"] for item in payload["disciplines"]}
    candidates = [
        Candidate(
            item["id"],
            item["name"],
            item.get("city", "Не указан"),
            item.get("work_format", "remote"),
            item.get("desired_role", "ИТ-специалист"),
            item.get("about", "Профиль импортирован из ФСП"),
            tuple(item.get("stack", ())),
        )
        for item in payload["participants"]
    ]
    competitions = [
        Competition(
            id=item["id"],
            name=item["name"],
            discipline=disciplines[item["discipline_id"]],
            source="fsp",
            participants=item["participants"],
            difficulty=item["difficulty"],
            official=item.get("official", True),
            skill_relevance=item["skills"],
            starts_on=date.fromisoformat(item["starts_on"]) if item.get("starts_on") else None,
        )
        for item in payload["competitions"]
    ]
    achievements = [
        Achievement(
            id=f"fsp:{item['id']}",
            candidate_id=item["participant_id"],
            competition_id=item["competition_id"],
            source="fsp",
            external_id=item["id"],
            placement=item["placement"],
            participants=item["participants"],
            role=item["role"],
            rank=item.get("rank"),
        )
        for item in payload["results"]
    ]
    with store.connection() as connection:
        store.upsert_candidates(candidates, connection)
        store.upsert_competitions(competitions, connection)
        store.upsert_achievements(achievements, connection)
    return {
        "disciplines": len(disciplines),
        "competitions": len(competitions),
        "participants": len(candidates),
        "results": len(achievements),
    }
