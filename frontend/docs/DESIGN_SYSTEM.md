# Design system

The visual language of the app: a dark plum sidebar, a light workspace, purple actions and status colors for
evidence and decisions. Values live in [`../src/app/styles/tokens.css`](../src/app/styles/tokens.css) (imported by
`global.css`); [`tokens.json`](../src/app/styles/tokens.json) holds the same values for tooling, so a change goes into
both. Components use tokens only, never literal colors. The product wordmark is the text «ФСП / Карьера»; there is
no official logo asset in the app.

## Tokens

All names are prefixed `--fsp-`.

| Group | Tokens |
| --- | --- |
| Surfaces | `color-canvas` `#f7f5fa` (page), `color-surface` `#ffffff` (cards), `color-surface-subtle` `#f2edf8` (quiet sections, selection) |
| Text | `color-text` `#181322`, `color-text-secondary` `#5d526a`, `color-text-muted` `#766983` |
| Borders | `color-border` `#ddd4e8` (decorative), `color-border-strong` `#8d8199` (control boundaries) |
| Action | `color-primary` `#6500a8`, `color-primary-hover` `#520087`, `color-primary-active` `#41006c`, `color-on-primary` `#ffffff` |
| Sidebar | `color-sidebar` `#281036`, `color-sidebar-active` `#42204f`, `color-on-sidebar` `#ffffff`, `color-sidebar-muted` `#dbcee6` |
| Accent | `color-accent` `#d81780`, `color-accent-subtle` `#fff0f7` (navigation marker, «Новое», demo labels) |
| Status | `color-success` `#187a65`, `color-warning` `#925a00`, `color-danger` `#b4233b`, `color-neutral` `#5d526a`, each with a `-subtle` background |
| Focus | `color-focus` `#6500a8`, `color-focus-inverse` `#d9b3ff` (on the sidebar); `focus-width` 3px, `focus-offset` 3px |
| Type | `font-sans` (system UI stack with Cyrillic), `font-mono`; sizes `caption` 0.75rem, `small` 0.875rem, `body` 1rem, `section` 1.25rem, `page` 2rem; line heights 1.5 body, 1.2 headings |
| Space | `space-1` … `space-12`: 4, 8, 12, 16, 20, 24, 32, 40, 48 px |
| Radius | `radius-sm` 6px, `radius-control` 8px, `radius-card` 12px, `radius-panel` 16px, `radius-pill` |
| Size | `control-min-height` and `interactive-min-size` 44px, `sidebar-width` 248px, `header-height` 72px, `content-max-width` 1440px |
| Elevation | `shadow-card`, `shadow-overlay` |
| Motion | `motion-fast` 120ms, `motion-normal` 180ms, `motion-easing`; both durations are 0 under `prefers-reduced-motion` |

The design uses no web fonts, remote images or icon fonts; icons are inline SVG (`shared/ui/icon.tsx`).

## Layout

- The shell is a sidebar plus a column with a 72px header and the main region. Below 1024px the sidebar becomes a
  drawer (up to 18rem or 85% of the width) opened from the header and closed by Escape, the backdrop or navigation.
- Global layout classes in `global.css`: `stack`, `stack-lg`, `row` for spacing; `split` (main column plus side
  column, one column below 1100px); `split-even` and `form-grid` (two columns, one below 760px); `table-wrap` for
  horizontally scrollable tables; `small`, `muted`, `divider`, `visually-hidden`.
- Pages never scroll horizontally at narrow widths; wide tables scroll inside `table-wrap`.

## UI kit (`src/shared/ui`)

| Component | Use |
| --- | --- |
| `Button`, `ButtonLink` | Variants `primary`, `secondary`, `quiet`, `danger`; sizes `md` (44px) and `sm` (36px); leading or trailing icon; `pending` disables the button, shows a spinner and an optional pending label and sets `aria-busy` |
| `TextField`, `TextareaField`, `SelectField` | Labelled fields built on `FieldShell` with hint, error, required marker and counter |
| `Checkbox`, `Switch` | Boolean choices with descriptions; the switch is used for publication consent |
| `ToggleGroup`, `TokenInput` | Multi-select chips with a maximum (stack), free-text tokens (soft skills) |
| `Card`, `PageHeader`, `DefinitionList`, `SalaryBlock` | Sections, page title with subtitle and actions, term/value lists, the salary range with its basis |
| `StatusChip`, `Tag`, `TagList`, `Avatar` | State labels with tone and icon; neutral tags; avatars for initials, the anonymous candidate, a company or an icon |
| `Callout`, `EmptyState`, `ErrorState`, `LoadingState`, `InlineStatus`, toasts | Notices, empty and error states (with request ID and retry), skeletons, inline progress, confirmations |
| `Dialog`, `ConfirmDialog`, `Tabs`, `Segmented`, `Pagination` | Native modal `<dialog>` that returns focus to its opener, confirmations, tab lists, segmented switches, page navigation |
| `UnsavedChangesGuard` | Blocks navigation and reload while a form or draft has unsaved changes |

Tones of `StatusChip` and `Callout`: `success`, `warning`, `danger`, `neutral`, `info`, `accent`.

## Status vocabulary

One wording per state across the app (`src/shared/lib/labels.ts` and the entities' `ui.tsx`).

| Domain | Values |
| --- | --- |
| Specialization / grade | Бэкенд, Фронтенд, Фулстек / Джуниор, Мидл, Сеньор |
| Qualification | «Джуниор подтверждён» (success), «Уровень не подтверждён» (neutral), «Цель: Мидл» (target, shown only when it differs) |
| Skill | Проверено · Есть свидетельства · Найдено в работе · Недостаточно данных |
| Requirement | Подтверждено · Есть основания, нужна проверка · Недостаточно данных |
| Match group | Подходят по обязательным требованиям · Требуют дополнительной проверки · Не хватает свидетельств по обязательным требованиям |
| Assessment | Начата · В работе · Решение отправлено · Решение проверяется · Пройдена · Не пройдена · Сбой оценивания |
| Check | Пройдено · Доработать · Не запущено |
| Invitation, candidate view | Ожидает вашего решения · Просмотрено · ждёт решения · Принято · Отклонено · Отозвано компанией |
| Invitation, employer view | Отправлено · Просмотрено · Принято кандидатом · Отклонено кандидатом · Отозвано |
| Application, candidate view | Отправлен · Просмотрен компанией · Компания готова к разговору · Компания отказала · Отозван вами |
| Application, employer view | Новый · Просмотрен · ждёт решения · Принят · Отклонён · Отозван кандидатом |
| Vacancy fit (candidate) | Вы подходите по обязательным требованиям · Часть требований стоит подтвердить · Не хватает подтверждений по обязательным навыкам |
| Publication | Опубликована (with the date) · Не опубликована — приглашать можно без публикации |
| Repository | Обработан · В очереди · Временно недоступен |
| Work mode | Удалённо · Гибрид · В офисе |

Salaries read «200 000 – 260 000 ₽/мес» with «До вычета налогов» next to them. Synthetic data is labelled
(«Демо-источник», «демо-ссылка», «Синтетические данные демонстрации», «Демонстрационный ответ») wherever it appears.

## Accessibility

Every control has a visible label, errors are linked to their fields and announced, focus rings use the focus
tokens, standard controls are at least 44px high (small buttons 36px), status is never conveyed by color alone (chips
carry text and an icon), the graph has a keyboard-operable list equivalent, and motion respects
`prefers-reduced-motion`.
