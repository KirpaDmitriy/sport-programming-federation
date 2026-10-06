import { loadAccountState, openAuth } from './account.ts';
import { api, messageOf } from './api.ts';
import { $, $$, dataOf, field, formReader, setStatus, toast } from './dom.ts';
import { formatLabel, html, initials, money, percent } from './format.ts';
import { employerProfile, requireVacancy, selectedVacancyId, skillById, state, vacancyById } from './state.ts';
import type {
  CandidateDetailForVacancy,
  CandidateMatch,
  Created,
  GraphDraft,
  InvitationInput,
  PublicVacancy,
  Requirement,
  Vacancy,
  VacancyInput,
} from './types.ts';

export function renderVacancies(): void {
  $('#vacancy-list').innerHTML = state.vacancies
    .map(
      (vacancy) => `
    <button class="vacancy-card ${vacancy.id === state.vacancyId ? 'active' : ''}" data-vacancy="${html(vacancy.id)}">
      <span class="vacancy-meta"><span>${html(vacancy.employer)}</span><span>${html(formatLabel[vacancy.work_format] || vacancy.work_format)}</span></span>
      <h3>${html(vacancy.title)}</h3>
      <span class="vacancy-salary">${money(vacancy.salary_from)} — ${money(vacancy.salary_to)}</span>
    </button>
  `,
    )
    .join('');
  for (const button of $$('[data-vacancy]')) {
    button.addEventListener('click', () => selectVacancy(dataOf(button, 'vacancy')));
  }
}

function renderFilters(): void {
  const categories = [
    'Все',
    ...new Set(
      state.candidates.flatMap((item) => [
        ...item.profile.categories,
        ...(item.tested_category ? [item.tested_category] : []),
      ]),
    ),
  ];
  $('#category-filters').innerHTML = categories
    .map(
      (category) => `
    <button class="filter-chip ${state.category === category ? 'active' : ''}" data-category="${html(category)}">${html(category)}</button>
  `,
    )
    .join('');
  for (const button of $$('[data-category]')) {
    button.addEventListener('click', () => {
      state.category = dataOf(button, 'category');
      renderFilters();
      renderCandidates();
    });
  }
}

function matchesFilters(item: CandidateMatch, query: string): boolean {
  const categoryMatch =
    state.category === 'Все' ||
    item.match.profile.categories.includes(state.category) ||
    item.tested_category === state.category;
  const haystack = [item.name, item.city, item.desired_role, ...item.stack].join(' ').toLocaleLowerCase('ru');
  const specializationMatch =
    !state.specialization || Boolean(item.tested_category?.startsWith(`${state.specialization}:`));
  const gradeMatch =
    !state.grade || item.verified_grade === state.grade || Boolean(item.tested_category?.endsWith(`:${state.grade}`));
  const fspMatch = !state.fsp || item.has_fsp_history === (state.fsp === 'yes');
  return categoryMatch && specializationMatch && gradeMatch && fspMatch && (!query || haystack.includes(query));
}

export function renderCandidates(): void {
  const query = state.search.trim().toLocaleLowerCase('ru');
  const matches = state.matches.filter((item) => matchesFilters(item, query));
  if (!matches.length) {
    $('#candidate-grid').innerHTML =
      '<div class="empty-state">В этой категории пока никого. Снимите фильтр или выберите другую вакансию.</div>';
    return;
  }
  $('#candidate-grid').innerHTML = matches
    .map((candidate) => {
      const topSkills = Object.values(candidate.match.profile.skills)
        .sort((a, b) => b.level - a.level)
        .slice(0, 3);
      return `
      <article class="candidate-card">
        <div class="candidate-head">
          <div class="avatar">${html(initials(candidate.name))}</div>
          <div class="score-ring" style="--score:${candidate.match.score}" aria-label="Совпадение ${candidate.match.score} процентов">${Math.round(candidate.match.score)}</div>
        </div>
        <h3>${html(candidate.name)}</h3>
        <div class="candidate-role">${html(candidate.desired_role)} · ${html(candidate.city)}</div>
        <div class="candidate-proofline"><span>Пример профиля</span> · ${candidate.tested_category ? `тест: ${html(candidate.tested_category)}` : 'навыки из достижений'} · ${candidate.has_fsp_history ? 'есть результаты соревнований' : 'без результатов соревнований'}</div>
        <div class="tag-row">${topSkills.map((skill) => `<span class="tag">${html(skillById(skill.skill_id)?.name || skill.skill_id)} ${percent(skill.level)}</span>`).join('')}</div>
        <div class="candidate-foot">
          <span>${candidate.match.critical_gaps ? `критичных пробелов: ${candidate.match.critical_gaps}` : 'критичные навыки закрыты'}</span>
          <button class="link-button" data-candidate="${html(candidate.id)}">Открыть профиль <span>↗</span></button>
        </div>
      </article>
    `;
    })
    .join('');
  for (const button of $$('[data-candidate]')) {
    button.addEventListener('click', () => openCandidate(dataOf(button, 'candidate')));
  }
}

export async function selectVacancy(id: string): Promise<void> {
  state.vacancyId = id;
  renderVacancies();
  $('#candidate-grid').innerHTML = '<div class="empty-state">Пересчитываем графы доказательств…</div>';
  state.matches = await api<CandidateMatch[]>(`/api/v1/vacancies/${encodeURIComponent(id)}/matches`);
  renderFilters();
  renderCandidates();
}

async function openCandidate(id: string): Promise<void> {
  const vacancyId = selectedVacancyId();
  const candidate = await api<CandidateDetailForVacancy>(
    `/api/v1/candidates/${encodeURIComponent(id)}?vacancy_id=${encodeURIComponent(vacancyId)}`,
  );
  const score = candidate.match.score;
  const skills = Object.values(candidate.match.profile.skills)
    .sort((a, b) => b.level - a.level)
    .slice(0, 6);
  $('#candidate-detail').innerHTML = `
    <div class="detail-hero">
      <div class="avatar">${html(initials(candidate.name))}</div>
      <h2>${html(candidate.name)}</h2>
      <div>${html(candidate.desired_role)} · ${html(candidate.city)} · ${html(formatLabel[candidate.work_format] || candidate.work_format)}</div>
    </div>
    <div class="detail-body">
      <div class="detail-score">
        <div class="score-ring" style="--score:${score}">${Math.round(score)}</div>
        <div><p class="eyebrow blue">Совпадение с вакансией</p><h3>${candidate.match.critical_gaps ? `${candidate.match.critical_gaps} критичных пробела` : 'Критичные требования закрыты'}</h3><p class="quiet">${html(candidate.about)}</p></div>
      </div>
      <div class="detail-skills">${skills.map((skill) => `<div class="skill-bar"><div><span>${html(skillById(skill.skill_id)?.name)}</span><span>${percent(skill.level)} · доверие ${percent(skill.confidence)}</span></div><div class="progress"><i style="width:${percent(skill.level)}"></i></div></div>`).join('')}</div>
      <div class="detail-actions">${
        candidate.tested_category
          ? `<button class="button button-dark" data-offer="${html(candidate.id)}">Сделать предложение · ${money(requireVacancy(vacancyId).salary_from)}+</button>`
          : '<div class="demo-boundary">Это демонстрационный профиль. Приглашения доступны зарегистрированным кандидатам.</div>'
      }</div>
    </div>`;
  $('#candidate-dialog', HTMLDialogElement).showModal();
  document.querySelector('[data-offer]')?.addEventListener('click', () => openOffer(id));
}

async function openOffer(candidateId: string): Promise<void> {
  const candidateDialog = $('#candidate-dialog', HTMLDialogElement);
  if (state.user?.role !== 'employer') {
    candidateDialog.close();
    openAuth('login', 'Войдите как работодатель, чтобы отправить приглашение');
    return;
  }
  await loadAccountState();
  candidateDialog.close();
  const form = $('#offer-form', HTMLFormElement);
  field(form, 'candidate_id', HTMLInputElement).value = candidateId;
  const vacancySelect = field(form, 'vacancy_id', HTMLSelectElement);
  vacancySelect.innerHTML = `<option value="">Без привязки к вакансии</option>${state.ownedVacancies.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join('')}`;
  const [owned] = state.ownedVacancies;
  const vacancy: Vacancy | undefined = owned || vacancyById(state.vacancyId);
  if (owned) vacancySelect.value = owned.id;
  field(form, 'position_title', HTMLInputElement).value = vacancy?.title || 'ИТ-специалист';
  field(form, 'salary_from', HTMLInputElement).value = String(vacancy?.salary_from ?? '');
  field(form, 'salary_to', HTMLInputElement).value = String(vacancy?.salary_to ?? '');
  field(form, 'contact_method', HTMLInputElement).value = employerProfile()?.contact_method || '';
  setStatus(form, '');
  $('#offer-dialog', HTMLDialogElement).showModal();
}

export function bindForms(): void {
  const offerForm = $('#offer-form', HTMLFormElement);
  offerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = formReader(offerForm);
    const payload: InvitationInput = {
      candidate_id: value('candidate_id'),
      vacancy_id: value('vacancy_id') || null,
      position_title: value('position_title'),
      salary_from: Number(value('salary_from')),
      salary_to: Number(value('salary_to')),
      description: value('message'),
      contact_method: value('contact_method'),
    };
    try {
      await api<Created>('/api/v1/invitations', { method: 'POST', body: payload });
      setStatus(offerForm, 'Предложение отправлено');
      window.setTimeout(() => $('#offer-dialog', HTMLDialogElement).close(), 700);
      toast('Предложение появилось у кандидата');
      await loadAccountState();
    } catch (error) {
      setStatus(offerForm, messageOf(error));
    }
  });

  const vacancyForm = $('#vacancy-form', HTMLFormElement);
  vacancyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = formReader(vacancyForm);
    const requirements: Requirement[] = $$('.requirement-editor', vacancyForm).map((row) => ({
      skill_id: $('[name=skill_id]', HTMLSelectElement, row).value,
      level: Number($('[name=level]', HTMLInputElement, row).value) / 100,
      criticality: Number($('[name=criticality]', HTMLInputElement, row).value),
    }));
    const competitionIds = $$('[name="competition_ids"]:checked', HTMLInputElement, vacancyForm).map(
      (input) => input.value,
    );
    const payload: VacancyInput = {
      id: `vacancy-${Date.now()}`,
      employer: value('employer'),
      title: value('title'),
      grade: value('grade'),
      specialization: value('specialization'),
      description: value('description'),
      team_description: value('team_description'),
      work_format: value('work_format'),
      salary_from: Number(value('salary_from')),
      salary_to: Number(value('salary_to')),
      requirements,
      evidence_policy: { mode: value('policy_mode'), competition_ids: competitionIds },
    };
    try {
      const created = await api<Vacancy>('/api/v1/vacancies', { method: 'POST', body: payload });
      state.vacancies = await api<PublicVacancy[]>('/api/v1/vacancies');
      state.vacancyId = created.id;
      renderVacancies();
      await selectVacancy(created.id);
      setStatus(vacancyForm, 'Вакансия создана');
      window.setTimeout(() => $('#vacancy-dialog', HTMLDialogElement).close(), 600);
      toast('Граф требований готов — подбор пересчитан');
      await loadAccountState();
    } catch (error) {
      setStatus(vacancyForm, messageOf(error));
    }
  });
}

export function addRequirement(skillId = '', level = 70, criticality = 4): void {
  const row = document.createElement('div');
  row.className = 'requirement-editor';
  row.innerHTML = `
    <label>Навык<select name="skill_id">${state.catalog.skills.map((item) => `<option value="${html(item.id)}" ${item.id === skillId ? 'selected' : ''}>${html(item.name)}</option>`).join('')}</select></label>
    <label>Уровень <output>${level}%</output><input name="level" type="range" min="20" max="100" value="${level}"></label>
    <label>Критичность <output>${criticality} / 5</output><input name="criticality" type="range" min="1" max="5" value="${criticality}"></label>
    <button class="remove-requirement" type="button" aria-label="Удалить навык">×</button>`;
  const bindRange = (name: string, format: (value: string) => string): void => {
    const input = $(`[name=${name}]`, HTMLInputElement, row);
    const output = $('output', HTMLOutputElement, input.closest('label') ?? row);
    input.addEventListener('input', () => {
      output.textContent = format(input.value);
    });
  };
  bindRange('level', (value) => `${value}%`);
  bindRange('criticality', (value) => `${value} / 5`);
  $('.remove-requirement', row).addEventListener('click', () => {
    if ($$('.requirement-editor').length > 1) row.remove();
  });
  $('#requirement-builder').append(row);
}

export function renderCompetitionOptions(): void {
  $('#competition-options').innerHTML = state.catalog.competitions
    .map(
      (item) => `
    <label><input type="checkbox" name="competition_ids" value="${html(item.id)}"> <span>${html(item.name)}</span></label>
  `,
    )
    .join('');
}

export async function draftVacancyGraph(): Promise<void> {
  const form = $('#vacancy-form', HTMLFormElement);
  const value = formReader(form);
  const text = ['title', 'grade', 'specialization', 'description', 'team_description']
    .map((name) => value(name))
    .join('. ');
  setStatus(form, 'Собираем граф требований…');
  try {
    const draft = await api<GraphDraft>('/api/v1/graph/vacancy-draft', { method: 'POST', body: { text } });
    if (!draft.requirements.length) {
      setStatus(form, draft.warnings[0] ?? '');
      return;
    }
    $('#requirement-builder').innerHTML = '';
    for (const item of draft.requirements) {
      addRequirement(item.skill_id, Math.round(item.level * 100), item.criticality);
    }
    setStatus(form, `Граф собран: ${draft.requirements.length} навыков. Проверьте настройки перед сохранением.`);
  } catch (error) {
    setStatus(form, messageOf(error));
  }
}

export function openVacancyEditor(): void {
  if (state.user?.role !== 'employer') {
    openAuth('login', 'Войдите как работодатель, чтобы создать вакансию');
    return;
  }
  const profile = employerProfile();
  if (!profile) {
    toast('Сначала заполните профиль компании');
    return;
  }
  const employer = field($('#vacancy-form', HTMLFormElement), 'employer', HTMLInputElement);
  employer.value = profile.company_name;
  employer.readOnly = true;
  $('#vacancy-dialog', HTMLDialogElement).showModal();
}
