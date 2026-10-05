from app.domain.models import Match, Profile, Skill, Vacancy


def prerequisite_closure(skill_ids: set[str], skills: dict[str, Skill]) -> set[str]:
    closure: set[str] = set()
    visiting: set[str] = set()

    def visit(skill_id: str) -> None:
        if skill_id in closure:
            return
        if skill_id in visiting:
            raise ValueError(f"Skill graph contains a cycle at {skill_id}")
        skill = skills.get(skill_id)
        if skill is None:
            raise ValueError(f"Unknown skill in graph: {skill_id}")
        visiting.add(skill_id)
        for prerequisite in skill.prerequisites:
            visit(prerequisite)
        visiting.remove(skill_id)
        closure.add(skill_id)

    for skill_id in skill_ids:
        visit(skill_id)
    return closure


def graph_depths(skill_ids: set[str], skills: dict[str, Skill]) -> dict[str, int]:
    depths: dict[str, int] = {}

    def depth(skill_id: str) -> int:
        if skill_id in depths:
            return depths[skill_id]
        prerequisites = [item for item in skills[skill_id].prerequisites if item in skill_ids]
        depths[skill_id] = 0 if not prerequisites else max(depth(item) for item in prerequisites) + 1
        return depths[skill_id]

    for skill_id in skill_ids:
        depth(skill_id)
    return depths


def comparison_graph(
    skills: dict[str, Skill],
    profile: Profile,
    vacancy: Vacancy | None = None,
    match: Match | None = None,
) -> dict:
    requirements = {item.skill_id: item for item in vacancy.requirements} if vacancy else {}
    visible_ids = (
        prerequisite_closure(set(requirements), skills)
        if requirements
        else set(profile.skills)
    )
    depths = graph_depths(visible_ids, skills)
    gaps = {item.skill_id: item for item in match.gaps} if match else {}

    nodes = []
    for skill_id in sorted(visible_ids, key=lambda item: (depths[item], skills[item].name)):
        skill = skills[skill_id]
        assessment = profile.skills.get(skill_id)
        requirement = requirements.get(skill_id)
        confirmed_level = (
            assessment.level * (0.55 + 0.45 * assessment.confidence)
            if assessment else 0.0
        )
        if requirement:
            status = "gap" if skill_id in gaps else "ready"
        else:
            status = "confirmed" if assessment else "prerequisite_gap"
        nodes.append({
            "id": skill.id,
            "label": skill.name,
            "category": skill.category,
            "depth": depths[skill_id],
            "level": assessment.level if assessment else 0.0,
            "confidence": assessment.confidence if assessment else 0.0,
            "confirmed_level": round(confirmed_level, 4),
            "required_level": requirement.level if requirement else None,
            "criticality": requirement.criticality if requirement else None,
            "is_requirement": requirement is not None,
            "status": status,
        })

    edges = sorted([
        {"from": prerequisite, "to": skill_id}
        for skill_id in visible_ids
        for prerequisite in skills[skill_id].prerequisites
        if prerequisite in visible_ids
    ], key=lambda item: (depths[item["to"]], item["from"], item["to"]))
    return {"nodes": nodes, "edges": edges}
