# Screens

Every route of the application as implemented. Screenshots in [`screenshots/`](screenshots) are taken from the app
running against the mock (`SCREENSHOTS=1 bun run e2e e2e/screenshots.spec.ts` refreshes them). Operations per
route are listed in [`../../contracts/API_INTEGRATION.md`](../../contracts/API_INTEGRATION.md#screens-and-operations);
the rules behind each state are in [`../../docs/product/BUSINESS_RULES.md`](../../docs/product/BUSINESS_RULES.md).

Both workspaces share one shell: a sidebar with the role's sections and «Настройки», a header with breadcrumbs
(«Кабинет кандидата» or «Кабинет работодателя · company», then the section), the «Демо» button while the API runs in
mock mode, a bell with the count of new invitations (candidate) or new applications (employer), and the account
menu. Below 1024 px
the sidebar becomes a drawer opened from the header.

## Sign-in

### `/login` — «Вход и регистрация»

![Sign-in](screenshots/00-login.png)

- Choose «Кандидат» or «Работодатель», enter an e-mail, «Получить код». A new address creates an account of that
  role; an address registered with the other role gets «Роль аккаунта изменить нельзя».
- Second step «Подтвердите почту»: six-digit code with its lifetime, «Подтвердить и войти», «Отправить новый код»,
  «Изменить почту». Wrong, expired, used and locked codes each get their own message and the resend button is
  highlighted.
- While codes go to the demo mailbox, a note says no letter is sent; on the stand it shows the code. In development
  «Вставить код из демо-ящика» fills it in. The demo-stand build lists the seed accounts with «Подставить».
- After a `401` elsewhere the page shows «Сессия завершилась»; an already signed-in visitor sees «Вы уже вошли» with
  «Перейти в кабинет» and «Выйти».

## Candidate

Navigation: Обзор, Профиль, Источники, Навыки, Проверки, Задания, Приглашения, Вакансии, Отклики, Настройки.

### `/candidate/onboarding` — «Анкета кандидата»

![Onboarding](screenshots/15-onboarding.png)

Five steps with done markers: e-mail confirmed; consents (processing and publication as separate controls);
questionnaire (the profile form, or «Заполнить из PDF» after processing consent); optional sources; level check.
The last step offers «Подтвердить уровень» for the saved target when the server allows it, otherwise the reason
(unsupported specialization, active attempt, cooldown, downgrade).

### `/candidate/overview` — «Мой профиль»

![Candidate overview](screenshots/01-candidate-overview.png)

- Identity card: name, role, verified grade badge («Джуниор подтверждён» or «Уровень не подтверждён»), target badge
  («Цель: Мидл») when it differs, profile freshness once a grade is verified, stack, «Скачать PDF», and the visibility line: the alias employers see, or the
  blockers that keep the profile out of search.
- «Начните с анкеты» while the questionnaire is incomplete.
- «Мои компетенции»: skills with state, confirmed level and evidence sources, plus a summary of GitHub and FSP.
- «Следующий шаг» (shared with «Проверки»): continue the questionnaire, continue an active attempt, open an
  evaluating one, start a check for the target, or the reason why not, with the date the cooldown ends.
- «История проверок»: the last three attempts.

### `/candidate/profile` — «Профиль и цели»

![Profile and goals](screenshots/02-profile-goals.png)

The profile form (name, read-only e-mail, industry, specialization, grade for the check, experience in months, stack
of up to five, experience, team role, soft skills) with «Сохранить профиль» and «Отменить изменения»; «Импортировать
PDF»; «Для работодателей» — the anonymous preview; privacy settings; «Текущий статус» with the verified grade and the
selected target shown separately.

PDF import is a dialog: choose a PDF (type and size checked first), wait for the job, review and edit the preview
(marked as a demo extraction), «Применить». Nothing changes until the candidate confirms. The warning describes
the simulated behavior independently of the API implementation and does not expose the internal parser identifier.

### `/candidate/sources` — «Источники профиля»

![Sources](screenshots/03-profile-sources.png)

- GitHub: connect by account name (demo, ownership not checked); then found / processed / queued / unavailable
  counts, «Обновить», progress while the job runs, a retryable failure message, and a paged repository table with
  technologies and state.
- ФСП: «Указать ФСП ID»; then verified participation with the synthetic competitions, «Истории ФСП нет» (valid), or
  a temporary-failure message that is explicitly not «no history».
- «Что учитываем»: contribution of the connected account, active days, observation period; working hours are not
  measured.
- Connecting needs processing consent; all data is labelled synthetic.

### `/candidate/skills` — «Навыки и подтверждения»

![Skills and evidence](screenshots/04-skills-evidence.png)

«Список» or «Граф» (kept in the URL), a filter, and an inspector for the selected skill or evidence: state, the level
it was confirmed for and what the target still needs, evidence items with source, date, individual or team scope and
links (demo links as text, assessment evidence links to its result), and «Что ещё проверить» with the check and
catalog competitions. The graph and the list share one selection; the graph has zoom and fit controls and a legend.
Without skills: an empty state with «Подключить GitHub» and «Пройти проверку».

### `/candidate/assessments` — «Проверки»

«Как устроена проверка» (task family and variants, server draft, explanation, AI allowed, failure and service-error
rules, cooldown length from the server, no checks below the verified grade, supported scopes), «Следующий шаг», and
«История попыток»: date, target and variant, status, effect on the category («Джуниор → Мидл», «Грейд сохранён»,
«Без изменений, штрафа и ожидания нет»), «Продолжить» or «Подробнее».

### `/candidate/assessments/{id}/workspace` — practical check

![Assessment workspace](screenshots/05-assessment-workspace.png)

- Header with steps «Условие», «Решение», «Объяснение», and badges «ИИ разрешён, включая внешние инструменты» and
  «Неудачная попытка не снизит подтверждённый грейд»; a warning that code is not executed in the demo.
- Task panel with the prompt, requirements and the rubric with weights.
- Code editor with line numbers; checks with «Запустить проверки» and per-criterion results; explanation with the
  «Я использовал внешние ИИ-инструменты» checkbox.
- «ИИ-помощник» panel; demo answers are labelled.
- Footer: draft status («Черновик сохранён в …», «Есть несохранённые изменения», save error with «Повторить») and
  «Отправить решение», which asks for confirmation and requires code and explanation.
- An attempt that is already submitted shows a link to its result instead of the editor.

### `/candidate/assessments/{id}/result` — result

![Assessment result](screenshots/06-assessment-result.png)
![Failed upgrade](screenshots/14-failed-upgrade.png)

While evaluating: «Решение проверяется», polled until final. Then «Мидл подтверждён» / «… подтверждён повторно» /
«Мидл пока не подтверждён» / «Проверка не пройдена» / «Оценка не получена», with «Было» and «Теперь», «Профиль
обновлён автоматически» after a grade change, feedback, the next possible grade change, rubric results and check
results. Next steps depend on the outcome: retry, choose another target, open the profile, «Скачать PDF», and the next
skill gap.

### `/candidate/tasks` — «Задания»

![Tasks](screenshots/23-candidate-tasks.png)

«Задание недели» with the company, title, skill, minimum grade, time estimate, the end of the week and the prompt.
The answer form switches between «Подход к решению» and «Решение» and sends once; afterwards the card shows the
answer, «Ждёт оценки компании», «Засчитано» or «Нужно доработать» and the company's comment. Without a verified grade,
processing consent or a matching task the card says why, links to the fix and names the date of the next offer.
«Прошлые задания» lists earlier answers with their verdicts; «Актуальность профиля» shows «Профиль актуален» or
«Давно не обновлялся» with the last signal and explains the 90-day rule.

### `/candidate/invitations` — «Приглашения»

Tabs «Все», «Ждут решения», «Принятые», «Отклонённые и отозванные» (kept in the URL), each invitation with company,
need, salary with tax basis, work mode, date, status and «Новое». Refreshed when the window regains focus.

### `/candidate/invitations/{id}` — invitation

![Invitation](screenshots/10-candidate-invitation.png)
![Accepted invitation](screenshots/11-invitation-accepted.png)

Opening it marks it viewed. Shows the company, need, work mode, «Без публикации вакансии», salary, description,
message, company description, business area and the company's contact, and «Что можно подтвердить для этой роли»
(the gap plan). The decision card selects what to disclose (name and e-mail preselected, source links separately, at
least one required), «Принять и открыть контакты» and «Отклонить» (with confirmation). Accepted, declined and
withdrawn invitations show the outcome and, for acceptance, exactly which fields the company received. A conflict
from another tab shows «Статус уже изменился» and the current state.

### `/candidate/vacancies` — «Вакансии»

![Vacancies](screenshots/18-candidate-vacancies.png)

Published vacancies of all companies, newest first, with filters for specialization, grade, work mode and required
skill (kept in the URL) and paging. Each card shows the company, title, salary with tax basis, specialization, grade,
work mode, required skills, the publication date, the candidate's fit computed by the server («Вы подходите по
обязательным требованиям», «Часть требований стоит подтвердить», «Не хватает подтверждений…») and «Вы откликнулись».
While applying is not yet possible, a note names the reason and links to the fix (questionnaire, assessments,
settings). «Мои отклики» leads to the applications.

### `/candidate/vacancies/{id}` — vacancy

![Vacancy](screenshots/19-candidate-vacancy.png)

The company, work mode, specialization and grade, salary, description, requirements with importance, minimum level
and the candidate's confirmation per skill, the server's explanation, the company description and contact. The
application card asks for a cover letter (1–4000 characters) and what the company receives (name and e-mail
preselected, source links separately, at least one), then «Откликнуться и открыть контакты» opens the application.
Without a verified grade, questionnaire or processing consent the card says why and links to the fix; after applying
it shows «Вы откликнулись» with the status link. A vacancy taken down meanwhile says so instead of sending.

### `/candidate/applications` — «Отклики»

Tabs «Все», «На рассмотрении», «Приняты», «Отказы и отозванные» (kept in the URL), each application with company,
vacancy, salary, work mode, date and status.

### `/candidate/applications/{id}` — application

![Application](screenshots/20-candidate-application.png)

Status («Отправлен», «Просмотрен компанией», «Компания готова к разговору», «Компания отказала», «Отозван вами»)
with its meaning and timeline, the vacancy terms frozen at the moment of applying, the cover letter, the fit, the
company's contact and exactly which fields the company received. «Отозвать отклик» (with confirmation) is offered
while the company has not decided.

### `/candidate/settings` — «Настройки»

Privacy (both consents, how disclosure works, current visibility), sources with their state (disconnecting is not
supported), account e-mail and role, «Выйти».

## Employer

Navigation: Потребности, Кандидаты, Подборки, Приглашения, Отклики, Задания, Компания, Настройки.

### `/employer/needs` — «Потребности»

![Needs](screenshots/17-employer-needs.png)

Needs with specialization, grade, work mode, publication state («Опубликована» with the date or «Не опубликована —
приглашать можно без публикации»), salary with tax basis, required and desired skills and the update date; «Найти
кандидатов» (recommended search for the need), «Редактировать», «Опубликовать вакансию» or «Снять с публикации» (with
confirmation; an incomplete company profile gets a link to it), «Отклики: N» for published needs or needs with
applications, «Удалить» (with confirmation; sent invitations and received applications keep their terms) and «Новая
потребность». A new company sees an empty state with «Описать потребность».

### `/employer/needs/new`, `/employer/needs/{id}` — need editor

![Need editor](screenshots/07-employer-need.png)

Title, specialization, grade, work mode, salary «от» and «до» in whole rubles per month with the read-only basis «До
вычета налогов», description; requirements with skill, «Обязательно»/«Желательно», minimum level and accepted
evidence (practical checks, GitHub work, FSP competitions — any from the catalog or selected ones), a default policy
that can be applied to all rows, add and remove rows; a live summary. «Сохранить и найти кандидатов» opens
recommended search for the need, «Сохранить» stays. A note says invitations need no publication, or, for a published
need, that candidates see edits at once while received applications keep their terms; an incomplete company profile
gets a warning with a link, since invitations need it.

### `/employer/candidates` — «Кандидаты»

![Candidate search](screenshots/08-candidate-search.png)
![Search failure](screenshots/16-search-api-error.png)

- «Для потребности» selector and mode «Рекомендации» / «Весь банк»; filters for specialization, verified grade,
  stack and FSP. Everything is in the URL.
- Results grouped by match status («Подходят по обязательным требованиям», «Требуют дополнительной проверки», «Не
  хватает свидетельств по обязательным требованиям»), each row with alias, verified qualification and its date, FSP
  participation, freshness, stack, required coverage, the first missing requirement with its reason, desired gaps, and a bookmark
  for the active shortlist. The order is set by the server and the page says it is not a probability of hiring.
- Paging; empty results offer «Сбросить фильтры» or «Весь банк»; a search failure is an error state with retry,
  never stale or fixture results.
- Shortlist panel: choose or create a shortlist; members with availability; removal.

### `/employer/candidates/{id}` — anonymous candidate profile

![Anonymous profile](screenshots/09-candidate-employer-view.png)
![Invitation composer](screenshots/09b-invitation-composer.png)
![Disclosed contacts](screenshots/12-employer-disclosed-contacts.png)

Alias, verified specialization and grade with date, profile freshness, work modes, FSP participation; «Потребность для сравнения»;
tabs «Соответствие» (per requirement: result, evidence state, reason, gap plan), «Навыки» (list or graph without
evidence details) and «Проверки». The contacts card says «Контакты и ссылки скрыты до согласия кандидата» until the
candidate accepts this company's invitation, then shows only the fields they chose. «Пригласить кандидата» opens the
composer: need, offer text, the frozen terms and the company contact the candidate will see; blocked with a link
while the company profile is incomplete; an existing active invitation for the need is reported.

### `/employer/shortlists`, `/employer/shortlists/{id}` — «Подборки»

The list with member counts and update dates, «Создать подборку»; a shortlist page with members (unavailable ones
marked «Профиль недоступен: скрыт или вышел из банка»), removal, rename and delete (the candidates stay in the bank).

### `/employer/invitations` — «Приглашения»

![Employer invitations](screenshots/13-employer-invitations.png)

Status tabs (kept in the URL), each invitation with candidate alias, offer and salary, status and a timeline (sent,
viewed, decided), «Отозвать» for open ones (with confirmation; a conflict says the candidate already decided).

### `/employer/applications` — «Отклики»

![Applications](screenshots/21-employer-applications.png)

Applications to the company's vacancies with status tabs and, when there are several vacancies, a vacancy filter
(both kept in the URL; «Отклики: N» on a need opens it filtered). Each row shows the candidate alias with the opened
fields, the vacancy with salary and grade, required skills met and whether the grade fits, the status and a timeline.

### `/employer/applications/{id}` — application

![Application review](screenshots/22-employer-application.png)

Opening a new application marks it viewed. Shows the anonymous candidate (alias, verified specialization and grade,
verified FSP), a link to the full profile and graph, the contacts the candidate opened, the cover letter, the match
against the vacancy terms frozen at the moment of applying with a reason per requirement, and the terms. The decision
card offers «Принять и перейти к разговору» and «Отклонить» (with confirmation); decided and withdrawn applications
show the outcome, and a withdrawal closes the contacts.

### `/employer/tasks` — «Задания»

![Task answers](screenshots/24-employer-task-responses.png)

Tabs «Задания» and «Ответы кандидатов» (kept in the URL as `tab`). Tasks show the title, skill, minimum grade,
estimate, date, «Предлагается кандидатам» or «В архиве», the prompt, the answer count and «В архив» (with
confirmation). «Новое задание» opens a dialog with title, prompt, skill, minimum grade and minutes, validated before
sending; an incomplete company profile gets a link to it. Answers show the candidate alias (linking to the anonymous
profile), task, format, time, the answer and its verdict; open answers take an optional comment with «Засчитать» or
«Нужно доработать».

### `/employer/company` — «Профиль компании»

Name, business area, description, contact e-mail for candidates, optional website, «Сохранить»; a warning while the
profile is incomplete and «Как видит кандидат» with «Готово к приглашениям». There is no company verification.

### `/employer/settings` — «Настройки»

Account (company, role, whether the e-mail is verified), link to the company profile, «Выйти», and how access to
candidate data works.

## Shared states

Every data view has loading, empty and error states; errors show a human message, the request ID when present and
a retry. «Раздел недоступен» appears when a signed-in user opens the other role's section, «Страница не найдена» for
unknown paths.

Card headers wrap their heading and actions onto separate lines when space is limited, including the candidate
search count and ordering summary at mobile widths. Live browser verification and updated screenshots are tracked
in [issue #23](https://github.com/KirpaDmitriy/sport-programming-federation/issues/23). The screenshot set above remains
the documented mock fixture gallery, rather than evidence of live backend behavior.

Graph views request generation only when selected. Pending generation shows a loading state; failures show
the server error and an explicit retry, with the list still selectable. Automatic retries are disabled for
these potentially 45-second operations. [Issue #27](https://github.com/KirpaDmitriy/sport-programming-federation/issues/27)
records the related browser finding and final delivery proof.
