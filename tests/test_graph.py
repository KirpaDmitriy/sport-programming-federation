import pytest

from app.domain.graph import comparison_graph, prerequisite_closure
from app.domain.models import Profile, Requirement, Skill, SkillAssessment, Vacancy
from app.domain.scoring import match_candidate


SKILLS = {
    "statistics": Skill("statistics", "Статистика", "AI / ML"),
    "trees": Skill("trees", "Решающие деревья", "AI / ML", ("statistics",)),
    "forests": Skill("forests", "Случайные леса", "AI / ML", ("trees",)),
}


def vacancy() -> Vacancy:
    return Vacancy(
        "forest-role", "Лаборатория", "ML-инженер", "Middle", "remote",
        100_000, 200_000, (Requirement("forests", 0.7, 5),),
    )


def test_target_graph_contains_prerequisite_chain_without_promoting_parent_mastery() -> None:
    profile = Profile(
        "candidate",
        {"trees": SkillAssessment("trees", 0.9, 0.9, ("test:trees",))},
        ("AI / ML",),
        "advanced",
    )
    match = match_candidate("candidate", vacancy(), SKILLS, {}, [], {"trees": (0.9, 0.9, "test:trees")})

    graph = comparison_graph(SKILLS, profile, vacancy(), match)
    nodes = {item["id"]: item for item in graph["nodes"]}

    assert set(nodes) == {"statistics", "trees", "forests"}
    assert nodes["trees"]["status"] == "confirmed"
    assert nodes["forests"]["status"] == "gap"
    assert match.score == 0
    assert graph["edges"] == [
        {"from": "statistics", "to": "trees"},
        {"from": "trees", "to": "forests"},
    ]


def test_graph_rejects_cycles() -> None:
    cyclic = {
        "a": Skill("a", "A", "X", ("b",)),
        "b": Skill("b", "B", "X", ("a",)),
    }

    with pytest.raises(ValueError, match="cycle"):
        prerequisite_closure({"a"}, cyclic)
