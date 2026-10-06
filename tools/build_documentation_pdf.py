from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "ФСП_Карьера_техническая_документация.pdf"
FONT = ROOT / "app" / "assets" / "fonts" / "Roboto.ttf"

PURPLE = colors.HexColor("#57107B")
DEEP = colors.HexColor("#160E1E")
PINK = colors.HexColor("#F92571")
LIME = colors.HexColor("#C9FF47")
LILAC = colors.HexColor("#F3ECF8")
MUTED = colors.HexColor("#675D6E")
RULE = colors.HexColor("#D8C9E2")


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def bullets(items: list[str], style: ParagraphStyle) -> list[Paragraph]:
    return [p(f"• {item}", style) for item in items]


def page_chrome(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(PURPLE)
    canvas.rect(0, height - 13 * mm, width, 13 * mm, fill=1, stroke=0)
    canvas.setFont("Roboto", 8)
    canvas.setFillColor(colors.white)
    canvas.drawString(15 * mm, height - 8.5 * mm, "ФСП / КАРЬЕРА · 2026 · ТЕХНИЧЕСКАЯ ДОКУМЕНТАЦИЯ")
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 15 * mm, 9 * mm, f"{doc.page}")
    canvas.setStrokeColor(RULE)
    canvas.line(15 * mm, 13 * mm, width - 15 * mm, 13 * mm)
    canvas.restoreState()


def section(title: str, body: list, styles: dict[str, ParagraphStyle]) -> list:
    return [p(title, styles["h2"]), Spacer(1, 2.5 * mm), *body, Spacer(1, 4 * mm)]


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Roboto", str(FONT)))

    sample = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "title", parent=sample["Title"], fontName="Roboto", fontSize=31,
            leading=34, textColor=colors.white, alignment=TA_LEFT, spaceAfter=5 * mm,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=sample["BodyText"], fontName="Roboto", fontSize=14,
            leading=19, textColor=colors.white,
        ),
        "h1": ParagraphStyle(
            "h1", parent=sample["Heading1"], fontName="Roboto", fontSize=22,
            leading=26, textColor=PURPLE, spaceBefore=2 * mm, spaceAfter=4 * mm,
        ),
        "h2": ParagraphStyle(
            "h2", parent=sample["Heading2"], fontName="Roboto", fontSize=15,
            leading=19, textColor=PURPLE, spaceBefore=2 * mm,
        ),
        "body": ParagraphStyle(
            "body", parent=sample["BodyText"], fontName="Roboto", fontSize=9.6,
            leading=13.2, textColor=DEEP, spaceAfter=2.2 * mm,
        ),
        "small": ParagraphStyle(
            "small", parent=sample["BodyText"], fontName="Roboto", fontSize=8,
            leading=10.5, textColor=MUTED,
        ),
        "callout": ParagraphStyle(
            "callout", parent=sample["BodyText"], fontName="Roboto", fontSize=11,
            leading=15, textColor=DEEP, leftIndent=5 * mm, rightIndent=5 * mm,
            borderColor=PINK, borderWidth=1.2, borderPadding=5 * mm,
            backColor=LILAC, spaceBefore=6 * mm, spaceAfter=6 * mm,
        ),
        "cell": ParagraphStyle(
            "cell", parent=sample["BodyText"], fontName="Roboto", fontSize=7.7,
            leading=9.8, textColor=DEEP,
        ),
        "cell_head": ParagraphStyle(
            "cell_head", parent=sample["BodyText"], fontName="Roboto", fontSize=8,
            leading=10, textColor=colors.white,
        ),
    }

    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=19 * mm, bottomMargin=17 * mm, title="ФСП / Карьера — техническая документация",
        author="Дмитрий Кирпа",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates(PageTemplate(id="pages", frames=[frame], onPage=page_chrome))

    story: list = []
    cover = Table(
        [[p("ФСП / КАРЬЕРА", styles["title"])],
         [p("Обратный найм ИТ-специалистов по доказательствам навыков", styles["subtitle"])],
         [p("Рабочий MVP · два ролевых кабинета · проверяемый грейд · объяснимый мэтчинг", styles["subtitle"])],
         [p("Федерация спортивного программирования · специальный трек 2026", styles["subtitle"])],
         [p("Автор продукта: Дмитрий Кирпа", styles["subtitle"])]],
        colWidths=[doc.width], rowHeights=[34 * mm, 22 * mm, 23 * mm, 20 * mm, 21 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PURPLE),
            ("BACKGROUND", (0, 0), (0, 0), DEEP),
            ("BACKGROUND", (0, 2), (0, 2), PINK),
            ("BOX", (0, 0), (-1, -1), 0, PURPLE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 12 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12 * mm),
        ]),
    )
    story.extend([Spacer(1, 19 * mm), cover, Spacer(1, 10 * mm)])
    story.append(p("Документ фиксирует реализованный объём, алгоритмические решения, ограничения данных и способ воспроизведения результата. Бизнес-эффект не симулируется и требует реального пилота.", styles["callout"]))
    story.append(PageBreak())

    story.extend(section("1. Продукт и граница данных", [
        p("«ФСП / Карьера» меняет направление первого шага: работодатель ищет кандидата в банке доказательных профилей и отправляет персональное приглашение. Входной сигнал — не текстовое совпадение резюме, а подтверждённая категория, карта навыков, уверенность и объяснимые пробелы относительно потребности.", styles["body"]),
        p("Обновлённое ТЗ не предоставляет API, структуру реестра или набор данных ФСП. Поэтому демонстрационные спортивные результаты маркируются как синтетические. Собственный версионированный контракт FSP-sync существует как интеграционная граница, защищён ключом и не является заявлением о доступе к официальным данным.", styles["callout"]),
        *bullets([
            "кандидат без FSP ID проходит полный сценарий и не получает вымышленных достижений;",
            "реальный профиль, тест, приглашения, вакансии и отклики сохраняются через API приложения;",
            "будущий Keycloak подключается как OIDC-адаптер subject → внутренний user;",
            "название продукта не пересекается с названием компании «Контур».",
        ], styles["body"]),
    ], styles))

    story.extend(section("2. Сквозные сценарии", [
        Table([
            [p("КАНДИДАТ", styles["cell_head"]), p("РАБОТОДАТЕЛЬ", styles["cell_head"])],
            [p("Регистрация → подтверждение email → профиль и согласия → тест специализации/грейда → PDF-профиль → приглашения и вакансии → принятие, отказ или собственный отклик.", styles["cell"]),
             p("Регистрация → профиль компании → описание потребности/вакансии → фильтруемый банк → причины ранга → приглашение без обязательной вакансии → статусы и контакт после согласия.", styles["cell"])],
        ], colWidths=[doc.width / 2, doc.width / 2], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("BACKGROUND", (0, 1), (-1, 1), LILAC),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 4 * mm),
        ])),
    ], styles))
    story.append(PageBreak())

    story.extend(section("3. Тестирование и категоризация", [
        p("Банк содержит эквивалентные семейства вопросов для backend, data и frontend на уровнях intern, junior, middle и senior. Детерминированный вариант сохраняет blueprint тем и сложности, но меняет формулировки внутри эквивалентных семейств. Это делает результаты сопоставимыми и снижает ценность утечки одного варианта.", styles["body"]),
        Table([
            [p("Порог", styles["cell_head"]), p("Решение", styles["cell_head"]), p("Ограничение", styles["cell_head"])],
            [p("< 0.70", styles["cell"]), p("Заявленный грейд не подтверждён", styles["cell"]), p("Автоматического понижения нет", styles["cell"])],
            [p("≥ 0.70", styles["cell"]), p("Грейд подтверждён", styles["cell"]), p("Изменение блокируется на 90 дней", styles["cell"])],
            [p("≥ 0.875", styles["cell"]), p("Рекомендован следующий грейд", styles["cell"]), p("Без автоматического повышения", styles["cell"])],
        ], colWidths=[28 * mm, 76 * mm, 76 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LILAC]),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3 * mm),
        ])),
        p("Ответы, версия blueprint, балл, исход и сигналы навыков сохраняются. Тест остаётся самостоятельным доказательством, поэтому отсутствие истории ФСП не блокирует формирование профиля.", styles["body"]),
    ], styles))

    story.extend(section("4. Объяснимый мэтчинг", [
        p("Для каждой вакансии строится граф требований: уровень и критичность навыка. Доказательства кандидата проходят политику доверия, после чего вычисляются подтверждённый уровень, покрытие, абсолютная сила и критичные пробелы.", styles["body"]),
        p("score = (0.85 × coverage + 0.15 × verified strength) × 0.94<super>critical gaps</super>", styles["callout"]),
        *bullets([
            "coverage — среднее отношение подтверждённого уровня к требуемому с весом критичности;",
            "уровень и уверенность хранятся раздельно;",
            "API возвращает составляющие оценки и список пробелов;",
            "фильтры специализации, грейда, категории, стека и наличия ФСП уточняют текущую подборку.",
        ], styles["body"]),
    ], styles))
    story.append(PageBreak())

    story.extend(section("5. Архитектура и эксплуатация", [
        Table([
            [p("Слой", styles["cell_head"]), p("Ответственность", styles["cell_head"])],
            [p("web", styles["cell"]), p("FastAPI, OpenAPI, маршруты, роли, сессии, проекции приватных данных и статический адаптивный UI.", styles["cell"])],
            [p("application", styles["cell"]), p("Сценарии профиля, теста, подбора, приглашений, вакансий и откликов; транзакционные границы.", styles["cell"])],
            [p("domain", styles["cell"]), p("Графы навыков, evidence policy, категоризация, gap и score без зависимостей от FastAPI/SQLite.", styles["cell"])],
            [p("infrastructure", styles["cell"]), p("SQLite, SMTP, PDF и адаптер версионированного контракта FSP-sync.", styles["cell"])],
        ], colWidths=[35 * mm, 145 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LILAC]),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3 * mm),
        ])),
        *bullets([
            "CPU-only путь без обязательных внешних сервисов; один процесс на недорогой VM;",
            "SQLite и локальный файл дают простой воспроизводимый MVP и атомарный импорт;",
            "Keycloak/OIDC и ATS webhooks добавляются на внешних границах без смены доменной модели;",
            "сервис, каталог и порт отделены от MetroGuard, Nginx и сертификатов общей VM.",
        ], styles["body"]),
    ], styles))

    story.extend(section("6. Приватность и безопасность", [
        *bullets([
            "пароли и коды подтверждения хранятся как scrypt, session token — только как SHA-256 digest;",
            "cookie: HttpOnly, SameSite=Strict, а в HTTPS-режиме также Secure;",
            "кандидат и работодатель не читают чужие кабинеты, вакансии и статусы изменяет владелец;",
            "публикация требует согласия; контакт не входит в публичную карточку;",
            "контакт открывается после принятия приглашения или собственного отклика кандидата;",
            "в production подтверждение email отправляется через SMTP; demo-outbox включается только явно и не имитирует реальную отправку.",
        ], styles["body"]),
    ], styles))
    story.append(PageBreak())

    story.extend(section("7. Валидация", [
        p("Результаты называются только вместе с машинно-читаемым доказательством. Перед релизом выполняются 37 автоматических тестов, CPU-only smoke и проверка реестра экспериментов.", styles["body"]),
        Table([
            [p("Проверка", styles["cell_head"]), p("Условие успеха", styles["cell_head"]), p("Артефакт", styles["cell_head"])],
            [p("Assessment blueprint", styles["cell"]), p("Эквивалентные варианты сохраняют семьи, темы, число заданий и сложность", styles["cell"]), p("experiments/artifacts/*.junit.xml", styles["cell"])],
            [p("Мэтчинг", styles["cell"]), p("Границы уровней, доверия, allowlist и критичных пробелов дают ожидаемый порядок", styles["cell"]), p("pytest JUnit / unit tests", styles["cell"])],
            [p("API и приватность", styles["cell"]), p("401/403, владение, salary range, cooldown, SMTP, отсутствие ФСП и атомарность", styles["cell"]), p("37 passed", styles["cell"])],
            [p("Эксперименты", styles["cell"]), p("У каждого есть expected effect и failure condition", styles["cell"]), p("experiments/registry.json", styles["cell"])],
        ], colWidths=[39 * mm, 91 * mm, 50 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LILAC]),
            ("GRID", (0, 0), (-1, -1), 0.6, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3 * mm),
        ])),
        p("Метрики трудоустройства, точности найма или конверсии не заявляются: их можно измерить только на реальном пилоте с согласованной выборкой и заранее определённым протоколом.", styles["callout"]),
    ], styles))

    story.extend(section("8. Воспроизведение", [
        p("Локальный запуск: создать virtualenv, установить requirements.txt, затем выполнить uvicorn app.main:app. Для SMTP задать VYGOTSKY_DEMO_AUTH=0 и параметры VYGOTSKY_SMTP_*. Для FSP-sync задать VYGOTSKY_INTEGRATION_KEY и передавать X-Integration-Key.", styles["body"]),
        p("Контроль релиза: pytest → python tools/offline_smoke.py → python tools/experiments.py check. OpenAPI доступен в /docs и сохранён в docs/openapi.json.", styles["body"]),
    ], styles))
    story.append(PageBreak())

    story.extend(section("9. Покрытие требований и дальнейшие шаги", [
        p("Обязательный контур ТЗ покрыт ролевыми кабинетами, email-подтверждением, тестом грейда, фильтруемым банком, обратным приглашением, приватностью, вакансиями/откликами, PDF-профилем, OpenAPI, документацией и воспроизводимой валидацией. Полная матрица O-01…O-32, A-01…A-12 и T-01…T-15 находится в docs/requirements-traceability.md.", styles["body"]),
        p("Осознанно оставлены после MVP: регулярные короткие задания работодателей, проверка работодателя и anti-fraud модерация, реальный Keycloak/OIDC, ATS webhooks и калибровка тестов на пилотной выборке. Они не маскируются демонстрационными заглушками.", styles["callout"]),
        p("Приоритет пилота: проверить, сокращает ли объяснимый обратный поиск время до первого релевантного контакта, не ухудшая качество и добровольность взаимодействия для кандидата.", styles["body"]),
    ], styles))

    story.extend([
        Spacer(1, 8 * mm),
        KeepTogether([
            p("Ключевые файлы", styles["h2"]),
            *bullets([
                "README.md — запуск и демонстрационный сценарий;",
                "docs/architecture.md — архитектура и формула;",
                "docs/testing-and-validation.md — тест и протокол валидации;",
                "docs/fsp-integration.md — контракт и граница синтетических данных;",
                "docs/openapi.json — машиночитаемый API;",
                "docs/requirements-traceability.md — полная матрица требований.",
            ], styles["small"]),
        ]),
    ])

    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
