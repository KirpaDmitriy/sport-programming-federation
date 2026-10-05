import hashlib
from collections import defaultdict
from dataclasses import dataclass


GRADES = ("intern", "junior", "middle", "senior")
GRADE_LEVEL = {"intern": 0.28, "junior": 0.48, "middle": 0.72, "senior": 0.92}
PASS_THRESHOLD = 0.70
ADVANCE_THRESHOLD = 0.875


@dataclass(frozen=True)
class Question:
    id: str
    specialization: str
    grade: str
    family: str
    skill_id: str
    prompt: str
    options: tuple[str, ...]
    correct_index: int


def _question(
    identifier: str,
    specialization: str,
    grade: str,
    family: str,
    skill_id: str,
    prompt: str,
    options: tuple[str, str, str, str],
    correct: int,
) -> Question:
    return Question(identifier, specialization, grade, family, skill_id, prompt, options, correct)


QUESTION_BANK = (
    _question("common-i-a", "common", "intern", "complexity-i", "algorithms", "Сложность линейного поиска в массиве из n элементов?", ("O(1)", "O(log n)", "O(n)", "O(n²)"), 2),
    _question("common-i-b", "common", "intern", "complexity-i", "algorithms", "Сколько элементов в худшем случае просмотрит один проход поиска максимума?", ("Один", "Около log n", "Все n", "n²"), 2),
    _question("common-j-a", "common", "junior", "complexity-j", "algorithms", "Какая структура даёт средний поиск по ключу за O(1)?", ("Связный список", "Хеш-таблица", "Отсортированный массив без индекса", "Стек"), 1),
    _question("common-j-b", "common", "junior", "complexity-j", "algorithms", "Что обычно ускоряет частые проверки принадлежности уникальному набору?", ("Хеш-множество", "Очередь", "Стек вызовов", "Текстовый файл"), 0),
    _question("common-m-a", "common", "middle", "reliability-m", "distributed", "Что делает повтор сетевой команды безопасным после таймаута?", ("Больший timeout", "Идемпотентный ключ", "Случайная задержка", "Новый DNS"), 1),
    _question("common-m-b", "common", "middle", "reliability-m", "distributed", "Как избежать двойного списания при повторе запроса клиента?", ("Отключить retries", "Увеличить пул", "Сохранить idempotency key и результат", "Сменить JSON на XML"), 2),
    _question("common-s-a", "common", "senior", "systems-s", "distributed", "Какой приём уменьшает перераспределение ключей при изменении числа узлов?", ("Полный scan", "Consistent hashing", "Round-robin без состояния", "Один глобальный lock"), 1),
    _question("common-s-b", "common", "senior", "systems-s", "distributed", "Что снижает миграцию шардов при добавлении сервера?", ("Согласованное хеширование", "Случайный primary key", "Один shard", "Polling каждую секунду"), 0),

    _question("back-i-a", "backend", "intern", "language-i", "python", "Какой тип Python изменяемый?", ("tuple", "str", "list", "int"), 2),
    _question("back-i-b", "backend", "intern", "language-i", "python", "Какая коллекция Python допускает append?", ("list", "tuple", "frozenset", "str"), 0),
    _question("back-j-a", "backend", "junior", "storage-j", "databases", "Что гарантирует атомарность транзакции?", ("Все операции применятся вместе или откатятся", "Каждый SELECT использует индекс", "Ответ всегда из кэша", "Таблица не имеет NULL"), 0),
    _question("back-j-b", "backend", "junior", "storage-j", "databases", "Что верно для COMMIT транзакции?", ("Удаляет индексы", "Фиксирует согласованный набор изменений", "Сбрасывает схему", "Закрывает сервер"), 1),
    _question("back-m-a", "backend", "middle", "api-m", "distributed", "Клиент повторил POST после timeout. Лучший контракт?", ("Создать второй объект", "Игнорировать auth", "Поддержать idempotency key", "Всегда вернуть 500"), 2),
    _question("back-m-b", "backend", "middle", "api-m", "distributed", "Как безопасно обработать повтор команды create?", ("Дедуплицировать по ключу операции", "Запретить логи", "Увеличить body", "Сменить порт"), 0),
    _question("back-s-a", "backend", "senior", "load-s", "distributed", "Очередь растёт быстрее обработки. Первый системный механизм?", ("Backpressure и ограничение приёма", "Бесконечный retry", "Удалить метрики", "Отключить timeout"), 0),
    _question("back-s-b", "backend", "senior", "load-s", "distributed", "Как не допустить исчерпания памяти медленным consumer?", ("Убрать лимиты", "Bounded queue и backpressure", "Дублировать сообщения", "Скрыть lag"), 1),

    _question("data-i-a", "data", "intern", "validation-i", "data", "Зачем отделять test set?", ("Для обучения параметров", "Для независимой оценки", "Чтобы увеличить train loss", "Чтобы удалить признаки"), 1),
    _question("data-i-b", "data", "intern", "validation-i", "data", "На каких данных честно измерять итоговое качество?", ("На независимой тестовой выборке", "На тех же данных обучения", "Только на ошибках", "На случайной одной строке"), 0),
    _question("data-j-a", "data", "junior", "leakage-j", "ml", "Признак содержит целевое значение после события. Это?", ("Регуляризация", "Data leakage", "Batching", "Кластеризация"), 1),
    _question("data-j-b", "data", "junior", "leakage-j", "ml", "Среднее target рассчитано до split. Главный риск?", ("Утечка валидации", "Недостаток RAM", "Медленный SQL", "Слишком мало эпох"), 0),
    _question("data-m-a", "data", "middle", "metrics-m", "ml", "При редком fraud какой показатель информативнее accuracy?", ("Размер batch", "PR-AUC", "MSE времени ответа", "Число столбцов"), 1),
    _question("data-m-b", "data", "middle", "metrics-m", "ml", "Положительный класс 1%. Что лучше отражает баланс precision/recall?", ("PR-AUC", "Общая accuracy", "Число эпох", "R²"), 0),
    _question("data-s-a", "data", "senior", "drift-s", "ml", "Продакшен-распределение признаков изменилось. Первый сигнал?", ("Feature drift monitor", "Train accuracy", "Размер репозитория", "Количество ноутбуков"), 0),
    _question("data-s-b", "data", "senior", "drift-s", "ml", "Как раньше заметить деградацию модели без быстрых labels?", ("Мониторить сдвиг признаков и прокси", "Удалить baseline", "Увеличить learning rate в проде", "Не хранить версии"), 0),

    _question("front-i-a", "frontend", "intern", "web-i", "javascript", "Какой API подписывает обработчик события DOM?", ("addEventListener", "JSON.parse", "Math.max", "Object.freeze"), 0),
    _question("front-i-b", "frontend", "intern", "web-i", "javascript", "Как обработать клик без inline-атрибута?", ("setTimeout", "addEventListener", "fetch", "localStorage"), 1),
    _question("front-j-a", "frontend", "junior", "async-j", "javascript", "Что возвращает async-функция?", ("DOM node", "Promise", "CSS rule", "WebSocket"), 1),
    _question("front-j-b", "frontend", "junior", "async-j", "javascript", "Чем дождаться Promise внутри async-функции?", ("await", "yield CSS", "querySelector", "preventDefault"), 0),
    _question("front-m-a", "frontend", "middle", "render-m", "frontend", "Что уменьшает лишние перерисовки большого списка?", ("Стабильные ключи и мемоизация", "Новый key на каждый render", "Синхронный sleep", "Inline base64 для всех данных"), 0),
    _question("front-m-b", "frontend", "middle", "render-m", "frontend", "Почему случайный key элемента вреден?", ("Компонент постоянно перемонтируется", "Запрос становится POST", "CSS становится серверным", "Promise блокирует сеть"), 0),
    _question("front-s-a", "frontend", "senior", "performance-s", "frontend", "Как быстрее показать большой маршрут при старте?", ("Code splitting и lazy loading", "Один максимальный bundle", "Отключить cache", "Дублировать polyfills"), 0),
    _question("front-s-b", "frontend", "senior", "performance-s", "frontend", "Как уменьшить initial JavaScript без потери маршрутов?", ("Загрузить всё дважды", "Разбить bundle по маршрутам", "Запретить compression", "Хранить код в cookies"), 1),
)


QUESTION_BY_ID = {question.id: question for question in QUESTION_BANK}


def select_questions(attempt_id: str, specialization: str, target_grade: str) -> tuple[Question, ...]:
    if specialization not in {"backend", "data", "frontend"}:
        raise ValueError("Unsupported specialization")
    if target_grade not in GRADES:
        raise ValueError("Unsupported grade")
    max_grade = GRADES.index(target_grade)
    families: dict[tuple[str, str], list[Question]] = defaultdict(list)
    for question in QUESTION_BANK:
        if question.specialization not in {"common", specialization}:
            continue
        if GRADES.index(question.grade) <= max_grade:
            families[(question.grade, question.family)].append(question)
    selected = []
    for key, variants in sorted(families.items(), key=lambda item: (GRADES.index(item[0][0]), item[0][1])):
        digest = hashlib.sha256(f"{attempt_id}:{key[0]}:{key[1]}".encode()).digest()
        selected.append(sorted(variants, key=lambda item: item.id)[int.from_bytes(digest[:2]) % len(variants)])
    return tuple(selected)


def grade_attempt(target_grade: str, questions: tuple[Question, ...], answers: dict[str, int]) -> dict:
    if not questions or set(answers) != {question.id for question in questions}:
        raise ValueError("Every assessment question must have exactly one answer")
    correct = {question.id: answers[question.id] == question.correct_index for question in questions}
    score = sum(correct.values()) / len(questions)
    index = GRADES.index(target_grade)
    if score < PASS_THRESHOLD:
        recommended = GRADES[max(0, index - 1)]
        outcome = "not_confirmed"
    elif score >= ADVANCE_THRESHOLD and index < len(GRADES) - 1:
        recommended = GRADES[index + 1]
        outcome = "confirmed_ready_for_next"
    else:
        recommended = target_grade
        outcome = "confirmed"

    by_skill: dict[str, list[bool]] = defaultdict(list)
    for question in questions:
        by_skill[question.skill_id].append(correct[question.id])
    level_cap = GRADE_LEVEL[target_grade]
    signals = {
        skill_id: {
            "level": round(level_cap * (0.55 + 0.45 * (sum(results) / len(results))), 4),
            "confidence": round(min(0.88, 0.72 + 0.04 * len(results)), 4),
        }
        for skill_id, results in by_skill.items()
    }
    return {
        "score": round(score, 4),
        "passed": score >= PASS_THRESHOLD,
        "outcome": outcome,
        "recommended_grade": recommended,
        "correct": correct,
        "skill_signals": signals,
    }
