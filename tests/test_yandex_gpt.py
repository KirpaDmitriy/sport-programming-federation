import json

import pytest

from app.infrastructure.seed import SKILLS
from app.infrastructure.yandex_gpt import YandexGptError, YandexGptGraphExtractor


class FakeResponse:
    def __init__(self, result: object):
        self.payload = json.dumps({
            "result": {"alternatives": [{"message": {"text": json.dumps(result, ensure_ascii=False)}}]},
        }).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self) -> bytes:
        return self.payload


def configured(monkeypatch) -> YandexGptGraphExtractor:
    monkeypatch.setenv("VYGOTSKY_YANDEX_API_KEY", "test-key")
    monkeypatch.setenv("VYGOTSKY_YANDEX_FOLDER_ID", "test-folder")
    return YandexGptGraphExtractor()


def test_yandex_adapter_accepts_only_catalog_skills(monkeypatch) -> None:
    extractor = configured(monkeypatch)
    monkeypatch.setattr(
        "app.infrastructure.yandex_gpt.urlopen",
        lambda *_args, **_kwargs: FakeResponse([
            {"skill_id": "decision-trees", "level": 0.8, "criticality": 5, "relevance": 0.9, "rationale": "Указано в тексте"},
        ]),
    )

    result = extractor.extract("Нужны решающие деревья", {item.id: item for item in SKILLS}, "вакансия")

    assert result[0].skill_id == "decision-trees"


@pytest.mark.parametrize("result", [
    [{"skill_id": "invented", "level": 0.7}],
    [{"skill_id": "python", "level": "много"}],
])
def test_yandex_adapter_rejects_unknown_or_malformed_nodes(monkeypatch, result) -> None:
    extractor = configured(monkeypatch)
    monkeypatch.setattr(
        "app.infrastructure.yandex_gpt.urlopen",
        lambda *_args, **_kwargs: FakeResponse(result),
    )

    with pytest.raises(YandexGptError):
        extractor.extract("Описание длиннее двадцати символов", {item.id: item for item in SKILLS}, "вакансия")
