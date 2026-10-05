# Application design system

## Status and assets

The ten mockups define a coherent application direction: dark plum navigation, a light workspace, restrained purple actions, and evidence/status colors. The following tokens are **proposed implementation values**. They are not a reconstruction of an official FSP brandbook.

Use [`tokens.css`](../../frontend/src/app/styles/tokens.css) in the frontend foundation. [`tokens.json`](../../frontend/src/app/styles/tokens.json) contains the same 63 base token values for tooling and inspection. Keep the files synchronized if values change. The CSS also reduces token-based motion when the user requests reduced motion.

Use the system font stack included in the tokens. It supports the local system's Cyrillic fonts and requires no external font service. An optional custom typeface must be bundled with its license before it becomes a runtime dependency. Do not load fonts, logos, or illustration assets from an unlisted CDN.

The working product wordmark is `ФСП / Карьера`. Use supplied official brand assets when available and authorized. Do not treat an image-generated icon or traced screenshot lettering as an official vector logo. A text wordmark is sufficient for the mock frontend.

## Color roles

| Role | Token suffix | Value | Use |
|---|---|---|---|
| Page | `canvas` | `#F7F5FA` | Main background |
| Card | `surface` | `#FFFFFF` | Forms, tables, inspectors |
| Quiet background | `surface-subtle` | `#F2EDF8` | Secondary sections and selection context |
| Main text | `text` | `#181322` | Headings and substantive values |
| Supporting text | `text-secondary` | `#5D526A` | Descriptions and labels |
| Muted text | `text-muted` | `#766983` | Secondary metadata; never use opacity to weaken essential text |
| Decorative border | `border` | `#DDD4E8` | Card separators and nonessential structure |
| Control boundary | `border-strong` | `#8D8199` | Input/control boundaries where visual identification relies on the border |
| Primary action | `primary` | `#6500A8` | Main button and links |
| Sidebar | `sidebar` | `#281036` | Role navigation |
| Sidebar selection | `sidebar-active` | `#42204F` | Active route background |
| Accent | `accent` | `#D81780` | Small navigation marker and limited emphasis |
| Confirmed/success | `success` | `#187A65` | Confirmed result, saved/completed state |
| Needs attention | `warning` | `#925A00` | Partial evidence, retry condition, incomplete criterion |
| Failure | `danger` | `#B4233B` | Invalid input and failed operation |
| Neutral | `neutral` | `#5D526A` | Unknown/unobserved/unstarted states |

All suffixes above belong to the `--fsp-color-` namespace. Status background tokens have the same suffix plus `-subtle`.

### Contrast verification

Relative-luminance calculations for the provided colors give these approximate ratios:

| Foreground / background | Ratio |
|---|---:|
| Main text / white | 18.18:1 |
| Supporting text / white | 7.29:1 |
| Muted text / white | 5.10:1 |
| White / primary | 9.91:1 |
| Success text / success background | 4.69:1 |
| Warning text / warning background | 5.19:1 |
| Danger text / danger background | 5.68:1 |
| Neutral text / neutral background | 6.33:1 |
| Strong control border / white | 3.66:1 |

These checks cover the named pairs only. Recheck rendered combinations, disabled/hover states, graph text, overlays, and opacity. Do not sample pale text from the raster and assume it passes. The decorative border is intentionally unsuitable as the sole identifying boundary of an input.

## Typography and spacing

| Element | Proposed size | Treatment |
|---|---|---|
| Page title | 32px / 1.2 | Semibold or bold; allow wrapping |
| Section title | 20px / 1.2 | Semibold |
| Body/value | 16px / 1.5 | Regular |
| Label/supporting text | 14px / 1.5 | Regular or medium |
| Minor metadata | 12px | Use sparingly; not for decisions, errors, salary, or required consent copy |
| Code | System monospace, adjustable | Preserve whitespace and a clear focus/escape mechanism |

The tokens use `rem` values. Do not reduce the root font size to reproduce the screenshot dimensions. Use the 4px spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48. Typical card padding is 24px, form gaps 16–24px, and page gaps 24–32px. Cards use 12–16px corner radii; controls use 8px. Shadows are subtle and reserved mainly for elevated content.

Controls and icon-button hit areas have a **44px minimum target** in this project's design target. A 20px icon may sit within that area. Dense tables can retain compact row text while keeping the bookmark/open actions independently accessible.

## Application shell

**Desktop:** persistent sidebar, 72px header, main region with flexible content width and 24–32px padding. The nominal sidebar token is 248px. Treat it as a layout starting point, not a rule to squeeze a form into unreadable columns.

**Candidate navigation:** Обзор, Профиль, Источники, Навыки, Проверки, Приглашения, Настройки.

**Employer navigation:** Обзор, Потребности, Кандидаты, Подборки, Приглашения, Компания, Настройки.

Keep only implemented routes in navigation. An optional vacancy route must not replace the reverse-hiring journey. If there is no meaningful employer overview yet, route its entry to a working needs/summary view or omit the duplicate destination.

The header contains breadcrumbs or a concise page context, demo status, and account menu. A notification icon must lead to implemented invitation/notification state or be omitted. Demo account switching is a testing facility; do not present it as production authorization.

Use `header`, `nav`, `main`, and appropriate complementary regions. Mark the current route accessibly. A skip link moves focus to the main content. The page title and focus update on navigation; a sidebar click must not leave the screen reader at stale content.

## Shared component behavior

| Component | Required behavior |
|---|---|
| Button | Primary, secondary, quiet, destructive variants; visible focus; pending label; duplicate-submit protection where needed. A disabled action has a nearby reason when that affects the task. |
| Text field/select/combobox | Persistent label; help/error association; required indication; keyboard support; preserved value after a failed save. |
| Form section | Groups related fields; one clear save action; form-level error summary when multiple fields fail. |
| Status chip | Text plus icon. Domain-specific label is independent of visual color. |
| Evidence row | Skill, reference level, evidence state, evidence type, expandable grounds, limitation. Never encode “verified” in a color alone. |
| Category badge | Verified specialization/grade only. Selected grade is a separate target badge. |
| Candidate summary | Uses the role/tenant-specific DTO. Neutral avatar for anonymous profiles; no generated personal initials. |
| Salary block | Both bounds, RUB, period, and tax basis. Same formatting in form preview, invitation, and history. |
| Search filters | Labeled inputs, removable chips, clear-all, URL/state persistence, accessible mobile dialog. |
| Shortlist bookmark | Membership-driven selected state; accessible label such as `Удалить кандидата №024 из подборки`; visible save failure/rollback. |
| Data table | Real table semantics for tabular data; header associations; clearly labeled row actions. Do not make an entire row a nested interactive element. |
| Tabs | Keyboard navigation, selected state, associated panels. Content loaded lazily may expose its own loading indicator. |
| Dialog/drawer | Visible title; suitable initial focus; focus contained while modal; escape/close handling; focus returns to the invoking control. Dirty-form closing requires a clear save/discard choice. |
| Job status | Distinguishes queued/running/succeeded/failed/canceled meanings according to wire states; progress is real or explicitly indeterminate. |
| Toast/banner | Toast for supplemental confirmation. Persist important errors or required decisions in the page. Async status updates are announced without taking focus. |
| Graph inspector | Same data and selection as list view; readable nodes; keyboard-accessible alternatives; no identifying employer data hidden in tooltips. |

Use the project's chosen accessible primitive library consistently. Avoid mixing incompatible dialog, focus, form, and select behaviors from multiple ad hoc kits. Foundation components should support the required screens; do not build a general-purpose design platform first.

## State and icon vocabulary

| Semantic meaning | Russian copy examples | Visual treatment |
|---|---|---|
| Qualification confirmed | `Грейд подтверждён`, `Джуниор подтверждён` | Green check with text |
| Assessment target | `Цель: Мидл`, `Грейд для проверки` | Neutral/purple target marker |
| Observed technology | `Найдено в работе` | Neutral eye with text |
| Supporting evidence exists | `Есть свидетельства` | Amber evidence indicator |
| Need partly supported | `Есть основания`, `Нужна проверка` | Amber; show the actual missing condition |
| Insufficient information | `Недостаточно данных` | Neutral indicator; not a red rejection |
| Criterion not passed | `Требует доработки` | Error/attention treatment with reason |
| Source unavailable | `Временно недоступен` | Neutral/attention state with retry guidance |
| Processing | `Анализ продолжается`, `Решение проверяется` | Text with unobtrusive progress |
| Invitation awaiting decision | `Ожидает вашего решения` | Attention state |
| Invitation accepted/rejected | `Принято`, `Отклонено` | Explicit terminal label |

These are presentation examples. Do not create wire enum values by translating this table. Use the shared contract's semantics and a centralized Russian label map.

## Copy and formatting

- Use direct action labels: `Сохранить профиль`, `Найти кандидатов`, `Отправить приглашение`, `Принять и открыть контакты`.
- Use `Бэкенд`, `Фронтенд`, `Джуниор`, `Мидл` consistently. Do not alternate with invented category names or imply unsupported Senior assessments.
- Display the employer as `Север Тех` consistently. `Кандидат №024` is an alias, not an account's numeric database key.
- Format currency and dates with locale-aware formatters. Store and transport timestamps according to the contract; display the timezone when a cutoff or eligibility time could be ambiguous.
- Keep salary bounds and tax basis visible at the decision point. Do not replace the range with `От 200 000`, `По договорённости`, or a concealed tooltip.
- Use actual field-length validation and counters. Numbers painted into a mockup are not a character-count specification.
- Explain uncertainty: `Нет достаточных свидетельств` means an evidence gap, not proof of incompetence.
- Expose simulated infrastructure clearly in demo mode. Do not claim that GitHub was analyzed, a model ran, an email was delivered, or Rust code was executed when the mock returned a fixture.
- Product-facing errors describe recovery. Provider names, DSPy/Bifrost routes, correlation internals, and stack traces belong in appropriate diagnostics, not routine candidate screens.

## Accessibility implementation target

Target WCAG 2.2 AA for the implemented flow. This is a design/testing target, not a certification. Relevant requirements include text/control contrast, keyboard operation, visible and unobscured focus, reflow, labeled inputs, meaningful structure, and announced status changes. See the [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/). The project's 44px target size is an explicit design choice.

For modal focus behavior, follow the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Prefer existing accessible primitives and verify their integration rather than adding ARIA attributes to nonsemantic controls.

Practical checks for this product:

- Complete registration, filters, shortlist, and invitation decision using only the keyboard.
- Read the evidence graph through its list/detail alternative.
- Test dialog open/close and validation focus with a screen reader.
- Verify high-value states with text as well as color.
- Allow browser zoom and long Russian labels without clipping the primary actions.
- Keep the code editor escapable; explain any editor-specific keyboard command.
- Verify motion reduction and avoid loading shimmer that is needed to interpret status.
- Preserve a readable order when three assessment panes become tabs or stacked regions.

The external references above were read on 2026-10-05. Package/library versions are documented in the technical handoff; this document intentionally does not invent a “latest” UI library release.

## Visual review before completion

Review one screenshot for each of the ten canonical states, plus initial onboarding, failed upgrade, empty search, API failure, and accepted invitation. Check text overflow, clipping, table alignment, status consistency, selected bookmarks, empty-state actions, and privacy projection. Compare against the PNG layout while applying `MOCKUP_CORRECTIONS.md`.

Visual similarity alone is insufficient: a screenshot with a green badge does not establish qualification, and a blurred email does not establish privacy. The same review must include the corresponding API response and state transition for sensitive screens.
