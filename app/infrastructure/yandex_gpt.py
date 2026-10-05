import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.application.graph_extraction import SkillDraft
from app.domain.models import Skill


class YandexGptError(RuntimeError):
    pass


class YandexGptGraphExtractor:
    def __init__(self) -> None:
        self.api_key = os.environ.get("VYGOTSKY_YANDEX_API_KEY")
        self.folder_id = os.environ.get("VYGOTSKY_YANDEX_FOLDER_ID")
        self.model = os.environ.get("VYGOTSKY_YANDEX_MODEL", "yandexgpt/latest")
        self.endpoint = os.environ.get(
            "VYGOTSKY_YANDEX_ENDPOINT",
            "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        )

    @property
    def available(self) -> bool:
        return bool(self.api_key and self.folder_id)

    def extract(self, text: str, skills: dict[str, Skill], purpose: str) -> tuple[SkillDraft, ...]:
        if not self.available:
            raise YandexGptError("YandexGPT is not configured")
        catalog = [
            {"id": item.id, "name": item.name, "prerequisites": list(item.prerequisites)}
            for item in skills.values()
        ]
        system = (
            "Ты извлекаешь компетенции только из предоставленного каталога. "
            "Верни только JSON-массив объектов skill_id, level, criticality, relevance, rationale. "
            "level и relevance от 0 до 1, criticality от 1 до 5. Не создавай новые skill_id. "
            f"Назначение текста: {purpose}. Каталог: {json.dumps(catalog, ensure_ascii=False)}"
        )
        body = {
            "modelUri": f"gpt://{self.folder_id}/{self.model}",
            "completionOptions": {"stream": False, "temperature": 0.1, "maxTokens": "2000"},
            "messages": [
                {"role": "system", "text": system},
                {"role": "user", "text": text},
            ],
        }
        request = Request(
            self.endpoint,
            data=json.dumps(body, ensure_ascii=False).encode(),
            headers={"Authorization": f"Api-Key {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise YandexGptError("YandexGPT request failed") from error
        try:
            raw = payload["result"]["alternatives"][0]["message"]["text"].strip()
            if raw.startswith("```"):
                raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            items = json.loads(raw)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise YandexGptError("YandexGPT returned an invalid graph draft") from error
        if not isinstance(items, list):
            raise YandexGptError("YandexGPT graph draft must be a list")
        drafts = []
        seen = set()
        for item in items:
            if not isinstance(item, dict) or item.get("skill_id") not in skills:
                raise YandexGptError("YandexGPT returned an unknown skill")
            skill_id = item["skill_id"]
            if skill_id in seen:
                continue
            seen.add(skill_id)
            try:
                drafts.append(SkillDraft(
                    skill_id=skill_id,
                    level=max(0.0, min(1.0, float(item.get("level", 0.7)))),
                    criticality=max(1, min(5, int(item.get("criticality", 4)))),
                    relevance=max(0.0, min(1.0, float(item.get("relevance", 0.8)))),
                    rationale=str(item.get("rationale", "Выделено из текста"))[:500],
                ))
            except (TypeError, ValueError, OverflowError) as error:
                raise YandexGptError("YandexGPT returned invalid skill values") from error
        return tuple(drafts)
