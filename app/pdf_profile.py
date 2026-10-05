from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


FONT_PATH = Path(__file__).parent / "assets" / "fonts" / "Roboto.ttf"
FONT_NAME = "VygotskyRoboto"
PURPLE = colors.HexColor("#52056B")
VIOLET = colors.HexColor("#7A1CAC")
LIME = colors.HexColor("#D8FF75")
INK = colors.HexColor("#17131B")
MUTED = colors.HexColor("#655D69")


def _register_font() -> None:
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))


def build_candidate_pdf(profile: dict, computed_profile: dict, evidence: list[dict]) -> bytes:
    _register_font()
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=f"Профиль кандидата — {profile['name']}",
        author="Выготский",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleRu", parent=styles["Title"], fontName=FONT_NAME, fontSize=26,
        leading=30, textColor=PURPLE, alignment=TA_LEFT, spaceAfter=5 * mm,
    )
    heading = ParagraphStyle(
        "HeadingRu", parent=styles["Heading2"], fontName=FONT_NAME, fontSize=13,
        leading=16, textColor=PURPLE, spaceBefore=5 * mm, spaceAfter=2.5 * mm,
    )
    body = ParagraphStyle(
        "BodyRu", parent=styles["BodyText"], fontName=FONT_NAME, fontSize=9.5,
        leading=13, textColor=INK,
    )
    small = ParagraphStyle(
        "SmallRu", parent=body, fontSize=8, leading=10.5, textColor=MUTED,
    )
    table_header = ParagraphStyle(
        "TableHeaderRu", parent=small, textColor=colors.white,
    )
    badge = ParagraphStyle(
        "BadgeRu", parent=body, fontSize=9, leading=11, textColor=PURPLE,
    )

    verified_grade = profile.get("verified_grade") or "не подтверждён"
    category = f"{profile['specialization']} · {verified_grade}"
    story = [
        Paragraph("ВЫГОТСКИЙ · СТАНДАРТИЗИРОВАННЫЙ ПРОФИЛЬ", small),
        Paragraph(profile["name"], title),
        Table(
            [[
                Paragraph(f"<b>{profile['desired_role']}</b><br/>{profile['city']} · {profile['work_format']}", body),
                Paragraph(f"<b>Проверенная категория</b><br/>{category}", badge),
            ]],
            colWidths=[105 * mm, 50 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F5F1F7")),
                ("BACKGROUND", (1, 0), (1, 0), LIME),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
            ]),
        ),
        Paragraph("О кандидате", heading),
        Paragraph(profile["about"], body),
        Spacer(1, 2 * mm),
        Paragraph(
            f"<b>Стек:</b> {', '.join(profile['stack'])}<br/>"
            f"<b>Роли:</b> {', '.join(profile['roles']) or 'не указаны'}<br/>"
            f"<b>Soft skills:</b> {', '.join(profile['soft_skills']) or 'не указаны'}<br/>"
            f"<b>Опыт:</b> {profile['years_experience']} г. · <b>ФСП ID:</b> {profile.get('fsp_id') or 'не связан'}",
            body,
        ),
        Paragraph("Подтверждённые компетенции", heading),
    ]

    skill_rows = [[
        Paragraph("Компетенция", table_header),
        Paragraph("Уровень", table_header),
        Paragraph("Достоверность", table_header),
        Paragraph("Доказательств", table_header),
    ]]
    for skill_id, assessment in sorted(
        computed_profile["skills"].items(), key=lambda item: (-item[1]["level"], item[0]),
    ):
        skill_rows.append([
            Paragraph(skill_id, body),
            Paragraph(f"{assessment['level'] * 100:.0f}%", body),
            Paragraph(f"{assessment['confidence'] * 100:.0f}%", body),
            Paragraph(str(len(assessment["evidence_ids"])), body),
        ])
    if len(skill_rows) == 1:
        skill_rows.append([Paragraph("Пока нет подтверждённых компетенций", body), "—", "—", "0"])
    story.append(Table(
        skill_rows,
        colWidths=[75 * mm, 25 * mm, 32 * mm, 28 * mm],
        repeatRows=1,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DED8E2")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F5FA")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ]),
    ))

    story.append(Paragraph("Источники доказательств", heading))
    if evidence:
        for item in evidence:
            story.append(KeepTogether([
                Paragraph(f"<b>{item['competition']}</b> · {item['discipline']}", body),
                Paragraph(
                    f"Место {item['placement']} из {item['participants']} · роль {item['role']} · "
                    f"разряд {item.get('rank') or 'не указан'} · источник {item['source']}",
                    small,
                ),
                Spacer(1, 2 * mm),
            ]))
    else:
        story.append(Paragraph(
            "Истории ФСП пока нет. Категория может быть подтверждена платформенным тестированием.", body,
        ))

    story.extend([
        Paragraph("Контакт", heading),
        Paragraph(profile["contact_email"], body),
        Spacer(1, 5 * mm),
        Paragraph(
            "Уровень и достоверность показаны раздельно. Данные сформированы из текущего профиля "
            "и проверяемых источников платформы; демонстрационные записи не являются данными реестра ФСП.",
            small,
        ),
    ])

    def draw_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PURPLE)
        canvas.rect(0, A4[1] - 7 * mm, A4[0], 7 * mm, fill=1, stroke=0)
        canvas.setFont(FONT_NAME, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Выготский · стр. {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    return output.getvalue()
