from app.application.graph_extraction import extract_skill_drafts
from app.domain.models import Skill


SKILLS = {
    "python": Skill("python", "Python", "Backend"),
    "statistics": Skill("statistics", "Статистика", "AI / ML"),
    "decision-trees": Skill("decision-trees", "Решающие деревья", "AI / ML", ("statistics",)),
    "random-forests": Skill("random-forests", "Случайные леса", "AI / ML", ("decision-trees",)),
}


def test_offline_extractor_maps_known_skills_and_respects_optional_language() -> None:
    text = (
        "Обязательно уверенное знание решающих деревьев и случайных лесов. "
        "Python будет плюсом. Опыт с неизвестной внутренней системой приветствуется."
    )

    drafts = extract_skill_drafts(text, SKILLS)
    by_id = {item.skill_id: item for item in drafts}

    assert set(by_id) == {"decision-trees", "random-forests", "python"}
    assert by_id["decision-trees"].criticality == 5
    assert by_id["random-forests"].criticality == 5
    assert by_id["python"].criticality == 2
    assert all(item.skill_id in SKILLS for item in drafts)


def test_offline_extractor_is_deterministic_and_does_not_invent_skills() -> None:
    text = "Нужна квантовая телепортация и магия компилятора."

    assert extract_skill_drafts(text, SKILLS) == extract_skill_drafts(text, SKILLS) == ()
