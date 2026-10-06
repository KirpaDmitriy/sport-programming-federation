import { bindAccountForms, openAccount, openAuth, restoreSession, signedOut } from './account.ts';
import { api, messageOf, send } from './api.ts';
import { loadCandidateDashboard } from './candidate.ts';
import { $, $$, dataOf, toast } from './dom.ts';
import {
  addRequirement,
  bindForms,
  draftVacancyGraph,
  openVacancyEditor,
  renderCandidates,
  renderCompetitionOptions,
  renderVacancies,
  selectVacancy,
} from './employer.ts';
import { html } from './format.ts';
import { state } from './state.ts';
import type { CandidateSummary, Catalog, PublicVacancy } from './types.ts';
import { switchView } from './views.ts';

async function boot(): Promise<void> {
  try {
    [state.catalog, state.vacancies, state.candidates] = await Promise.all([
      api<Catalog>('/api/v1/catalog'),
      api<PublicVacancy[]>('/api/v1/vacancies'),
      api<CandidateSummary[]>('/api/v1/candidates'),
    ]);
    const [first] = state.vacancies;
    if (!first) throw new Error('Нет опубликованных вакансий');
    state.vacancyId = first.id;
    $('#persona-select').innerHTML = state.candidates
      .map((item) => `<option value="${html(item.id)}">${html(item.name)}</option>`)
      .join('');
    $('#candidate-vacancy').innerHTML = state.vacancies
      .map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`)
      .join('');
    addRequirement('python', 70, 5);
    addRequirement('algorithms', 60, 4);
    renderCompetitionOptions();
    renderVacancies();
    await selectVacancy(first.id);
    await restoreSession();
    if (new URLSearchParams(window.location.search).get('fsp') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      toast('ФСП ID подключён, результаты соревнований импортированы');
      await openAccount();
    }
  } catch (error) {
    $('#candidate-grid').innerHTML = `<div class="empty-state">${html(messageOf(error))}. Обновите страницу.</div>`;
  }
}

function bindFilter(selector: string, apply: (value: string) => void): void {
  const select = $(selector, HTMLSelectElement);
  select.addEventListener('change', () => {
    apply(select.value);
    renderCandidates();
  });
}

for (const button of $$('.role-button')) button.addEventListener('click', () => switchView(dataOf(button, 'view')));
for (const button of $$('[data-close]')) button.addEventListener('click', () => button.closest('dialog')?.close());
for (const dialog of $$('dialog', HTMLDialogElement)) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
$('#start-search').addEventListener('click', () => $('#workspace').scrollIntoView({ behavior: 'smooth' }));
$('#hero-register').addEventListener('click', () => openAuth('register'));
$('#open-auth').addEventListener('click', () => openAuth('login'));
$('#open-account').addEventListener('click', openAccount);
$('#account-new-vacancy').addEventListener('click', openVacancyEditor);
$('#find-candidates').addEventListener('click', () => switchView('employer'));
$('#back-to-demo').addEventListener('click', () =>
  switchView(state.user?.role === 'candidate' ? 'candidate' : 'employer'),
);
$('#logout').addEventListener('click', async () => {
  await send('/api/v1/auth/logout', { method: 'POST' });
  signedOut();
  switchView('employer');
  toast('Сессия завершена');
});
for (const button of $$('[data-open-data]')) {
  button.addEventListener('click', () => $('#data-dialog', HTMLDialogElement).showModal());
}
const search = $('#candidate-search', HTMLInputElement);
search.addEventListener('input', () => {
  state.search = search.value;
  renderCandidates();
});
bindFilter('#candidate-specialization', (value) => {
  state.specialization = value;
});
bindFilter('#candidate-grade', (value) => {
  state.grade = value;
});
bindFilter('#candidate-fsp', (value) => {
  state.fsp = value;
});
const persona = $('#persona-select', HTMLSelectElement);
persona.addEventListener('change', () => {
  state.candidateId = persona.value;
  loadCandidateDashboard();
});
$('#candidate-vacancy').addEventListener('change', loadCandidateDashboard);
$('#add-requirement').addEventListener('click', () => addRequirement());
$('#draft-vacancy-graph').addEventListener('click', draftVacancyGraph);
const policyMode = $('#vacancy-form [name=policy_mode]', HTMLSelectElement);
policyMode.addEventListener('change', () => {
  $('#competition-policy').hidden = policyMode.value !== 'allowlist';
});
bindForms();
bindAccountForms();
boot();
