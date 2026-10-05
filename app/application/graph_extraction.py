import re
from dataclasses import dataclass

from app.domain.models import Skill


ALIASES = {
    "algorithms": ("алгоритмы", "структуры данных", "algorithm"),
    "python": ("python", "питон"),
    "cpp": ("c++", "cpp"),
    "databases": ("базы данных", "sql", "postgresql"),
    "distributed": ("распределенные системы", "распределённые системы", "микросервисы"),
    "ml": ("машинное обучение", "machine learning", "ml"),
    "data": ("анализ данных", "data analysis", "data science"),
    "statistics": ("статистика", "теория вероятностей"),
    "data-preprocessing": ("подготовка данных", "подготовке данных", "предобработка данных", "feature engineering"),
    "decision-trees": ("решающие деревья", "решающих деревьев", "деревья решений", "decision tree"),
    "random-forests": ("случайные леса", "случайных лесов", "случайным лесам", "случайный лес", "random forest"),
    "gradient-boosting": ("градиентный бустинг", "gradient boosting", "catboost", "xgboost"),
    "neural-networks": ("нейронные сети", "neural network", "pytorch", "tensorflow"),
    "security": ("информационная безопасность", "кибербезопасность", "уязвимости"),
    "product": ("продуктовое мышление", "продуктовые метрики", "product management"),
    "teamwork": ("командная разработка", "командная работа", "работа в команде"),
    "javascript": ("javascript", "typescript"),
    "frontend": ("frontend", "фронтенд", "react", "vue"),
}


@dataclass(frozen=True)
class SkillDraft:
    skill_id: str
    level: float
    criticality: int
    relevance: float
    rationale: str


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold().replace("ё", "е")).strip()


def _sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"[.!?;\n]+", text) if item.strip()]


def _context_for(text: str, aliases: tuple[str, ...]) -> tuple[str, str] | None:
    for sentence in _sentences(text):
        normalized = _normalize(sentence)
        for alias in aliases:
            if _normalize(alias) in normalized:
                return sentence, alias
    return None


def extract_skill_drafts(text: str, skills: dict[str, Skill]) -> tuple[SkillDraft, ...]:
    normalized_text = _normalize(text)
    grade_level = 0.85 if re.search(r"\b(senior|ведущ|эксперт)\w*", normalized_text) else 0.7
    if re.search(r"\b(junior|начинающ|базов)\w*", normalized_text):
        grade_level = 0.45
    drafts = []
    for skill_id, skill in skills.items():
        aliases = tuple(dict.fromkeys((*ALIASES.get(skill_id, ()), skill.name)))
        context = _context_for(text, aliases)
        if context is None:
            continue
        sentence, alias = context
        normalized_sentence = _normalize(sentence)
        criticality = 2 if re.search(r"желательно|плюсом|будет плюсом", normalized_sentence) else 5 if re.search(r"обязательно|ключев|необходим", normalized_sentence) else 4
        relevance = 0.72 if criticality == 2 else 0.9
        drafts.append(SkillDraft(
            skill_id=skill_id,
            level=grade_level,
            criticality=criticality,
            relevance=relevance,
            rationale=f"Найдено «{alias}» в тексте: {sentence[:180]}",
        ))
    return tuple(drafts)
