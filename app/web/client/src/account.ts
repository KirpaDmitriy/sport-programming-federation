import { api, messageOf } from './api.ts';
import { $, $$, dataOf, field, formValues, setStatus, toast } from './dom.ts';
import { selectVacancy } from './employer.ts';
import { formatLabel, html, money } from './format.ts';
import { candidateProfile, employerProfile, requireVacancy, state } from './state.ts';
import type {
  Account,
  AssessmentAttempt,
  AssessmentResult,
  CandidateApplication,
  CandidateSummary,
  Created,
  EmployerApplication,
  EmployerInvitation,
  FspConnection,
  Invitation,
  LoginResult,
  RegisterResult,
  SavedCandidateAccount,
  Session,
  Vacancy,
} from './types.ts';
import { showAccountView, switchView } from './views.ts';

type AuthTab = 'login' | 'register' | 'verify';

function setAuthTab(tab: string): void {
  for (const button of $$('[data-auth-tab]')) button.classList.toggle('active', button.dataset.authTab === tab);
  $('#login-form').hidden = tab !== 'login';
  $('#register-form').hidden = tab !== 'register';
  $('#verify-form').hidden = tab !== 'verify';
}

export function openAuth(tab: AuthTab = 'login', message = ''): void {
  setAuthTab(tab);
  if (message) setStatus($('#login-form', HTMLFormElement), message);
  $('#auth-dialog', HTMLDialogElement).showModal();
}

function updateAuthChrome(): void {
  $('#open-auth').hidden = Boolean(state.user);
  $('#open-account').hidden = !state.user;
  if (state.user) $('#open-account').textContent = state.user.display_name;
}

export async function restoreSession(): Promise<void> {
  const session = await api<Session>('/api/v1/auth/session');
  state.user = session.authenticated ? session.user : null;
  updateAuthChrome();
}

export function signedOut(): void {
  state.user = null;
  state.account = null;
  state.ownedVacancies = [];
  updateAuthChrome();
}

function fillForm(form: HTMLFormElement, values: object): void {
  for (const [key, value] of Object.entries(values) as [string, unknown][]) {
    const control = form.elements.namedItem(key);
    if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
    else if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ) {
      control.value = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    }
  }
}

function commaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function invitationCard(
  item: Invitation & { candidate_name?: string; candidate_contact?: string | null },
  candidateMode: boolean,
): string {
  const actions =
    candidateMode && ['sent', 'viewed'].includes(item.status)
      ? `<div class="inline-actions"><button data-invitation-status="accepted" data-id="${item.id}">Принять</button><button data-invitation-status="rejected" data-id="${item.id}">Отклонить</button></div>`
      : '';
  return `<div class="record-card"><div><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.position_title)}</strong><p>${html(item.company_name)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div><p>${html(item.description)}</p>${candidateMode ? `<small>Связь: ${html(item.contact_method)}</small>` : `<small>${item.candidate_name ? html(item.candidate_name) : 'Кандидат'}${item.candidate_contact ? ` · ${html(item.candidate_contact)}` : ' · контакт откроется после принятия'}</small>`}${actions}</div>`;
}

function renderCandidateAccount(invitations: Invitation[], applications: CandidateApplication[]): void {
  $('#real-invitation-count').textContent = String(invitations.length);
  $('#real-invitations').innerHTML = invitations.length
    ? invitations.map((item) => invitationCard(item, true)).join('')
    : '<p class="quiet">Приглашений пока нет. После публикации профиль появится в банке работодателей.</p>';
  $('#real-applications').innerHTML = applications.length
    ? applications
        .map(
          (item) =>
            `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.title)}</strong><p>${html(item.employer)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div>`,
        )
        .join('')
    : '<p class="quiet">Вы пока не откликались. Основная механика сервиса — приглашения работодателей.</p>';
  const applied = new Set(applications.map((item) => item.vacancy_id));
  const vacancies = state.vacancies.filter((item) => item.accepts_applications);
  $('#real-vacancies').innerHTML = vacancies.length
    ? vacancies
        .map(
          (item) =>
            `<div class="real-vacancy"><div><small>${html(item.employer)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-apply="${html(item.id)}" ${applied.has(item.id) ? 'disabled' : ''}>${applied.has(item.id) ? 'Отклик отправлен' : 'Откликнуться'}</button></div>`,
        )
        .join('')
    : '<p class="quiet">Опубликованных вакансий зарегистрированных работодателей пока нет.</p>';
  for (const button of $$('[data-invitation-status]')) {
    button.addEventListener('click', async () => {
      const status = dataOf(button, 'invitationStatus');
      await api<Invitation>(`/api/v1/invitations/${dataOf(button, 'id')}/status`, {
        method: 'PATCH',
        body: { status },
      });
      toast(status === 'accepted' ? 'Приглашение принято — контакт открыт' : 'Приглашение отклонено');
      await loadAccountState();
    });
  }
  for (const button of $$('[data-apply]')) {
    button.addEventListener('click', () => {
      const vacancy = requireVacancy(dataOf(button, 'apply'));
      field($('#application-form', HTMLFormElement), 'vacancy_id', HTMLInputElement).value = vacancy.id;
      $('#application-title').textContent = `Отклик: ${vacancy.title}`;
      $('#application-dialog', HTMLDialogElement).showModal();
    });
  }
}

function renderEmployerAccount(invitations: EmployerInvitation[], applications: EmployerApplication[]): void {
  $('#employer-invitations').innerHTML = invitations.length
    ? invitations.map((item) => invitationCard(item, false)).join('')
    : '<p class="quiet">Откройте подборку и пригласите первого зарегистрированного кандидата.</p>';
  $('#employer-applications').innerHTML = applications.length
    ? applications
        .map(
          (item) =>
            `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.candidate_name)}</strong><p>${html(item.title)} · ${html(item.candidate_contact)}</p>${['submitted', 'viewed'].includes(item.status) ? `<div class="inline-actions"><button data-application-status="accepted" data-id="${item.id}">Принять</button><button data-application-status="rejected" data-id="${item.id}">Отклонить</button></div>` : ''}</div>`,
        )
        .join('')
    : '<p class="quiet">Входящих откликов пока нет.</p>';
  $('#owned-vacancies').innerHTML = state.ownedVacancies.length
    ? state.ownedVacancies
        .map(
          (item) =>
            `<div class="real-vacancy"><div><small>${html(item.grade)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-owned-match="${html(item.id)}">Подобрать</button></div>`,
        )
        .join('')
    : '<p class="quiet">Создайте первую вакансию с обязательной зарплатной вилкой.</p>';
  for (const button of $$('[data-application-status]')) {
    button.addEventListener('click', async () => {
      await api<EmployerApplication>(`/api/v1/applications/${dataOf(button, 'id')}/status`, {
        method: 'PATCH',
        body: { status: dataOf(button, 'applicationStatus') },
      });
      toast('Статус отклика обновлён');
      await loadAccountState();
    });
  }
  for (const button of $$('[data-owned-match]')) {
    button.addEventListener('click', async () => {
      const vacancyId = dataOf(button, 'ownedMatch');
      state.vacancyId = vacancyId;
      switchView('employer');
      await selectVacancy(vacancyId);
      $('#workspace').scrollIntoView({ behavior: 'smooth' });
    });
  }
}

export async function loadAccountState(): Promise<void> {
  const { user } = state;
  if (!user) return;
  state.account = await api<Account>('/api/v1/account/profile');
  $('#account-title').textContent = `Здравствуйте, ${user.display_name}`;
  $('#account-subtitle').textContent =
    user.role === 'candidate'
      ? 'Подтвердите специализацию — и работодатели смогут пригласить вас напрямую.'
      : 'Опишите команду, сформируйте граф требований и инициируйте контакт.';
  $('#candidate-account').hidden = user.role !== 'candidate';
  $('#employer-account').hidden = user.role !== 'employer';
  if (user.role === 'candidate') {
    const form = $('#candidate-profile-form', HTMLFormElement);
    const profile = candidateProfile();
    if (profile) fillForm(form, profile);
    else field(form, 'contact_email', HTMLInputElement).value = user.email;
    $('#verified-grade').textContent = profile?.verified_grade || 'не пройдено';
    $('#download-profile').hidden = !profile;
    if (profile) $('#assessment-grade', HTMLSelectElement).value = profile.claimed_grade;
    const [invitations, applications] = await Promise.all([
      api<Invitation[]>('/api/v1/invitations'),
      api<CandidateApplication[]>('/api/v1/applications'),
    ]);
    renderCandidateAccount(invitations, applications);
  } else {
    const profile = employerProfile();
    if (profile) fillForm($('#employer-profile-form', HTMLFormElement), profile);
    state.ownedVacancies = await api<Vacancy[]>('/api/v1/account/vacancies');
    const [invitations, applications] = await Promise.all([
      api<EmployerInvitation[]>('/api/v1/invitations'),
      api<EmployerApplication[]>('/api/v1/applications'),
    ]);
    renderEmployerAccount(invitations, applications);
  }
}

export async function openAccount(): Promise<void> {
  if (!state.user) {
    openAuth();
    return;
  }
  await loadAccountState();
  showAccountView();
}

export function bindAccountForms(): void {
  for (const button of $$('[data-auth-tab]')) {
    button.addEventListener('click', () => setAuthTab(dataOf(button, 'authTab')));
  }

  const registerForm = $('#register-form', HTMLFormElement);
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formValues(registerForm);
    try {
      const result = await api<RegisterResult>('/api/v1/auth/register', { method: 'POST', body: payload });
      field($('#verify-form', HTMLFormElement), 'email', HTMLInputElement).value = payload.email ?? '';
      $('#verification-note').innerHTML =
        result.verification_delivery === 'demo_outbox'
          ? `Код подтверждения для тестового стенда: <strong>${html(result.verification_code)}</strong>`
          : 'Мы отправили код на указанный email.';
      setAuthTab('verify');
    } catch (error) {
      setStatus(registerForm, messageOf(error));
    }
  });

  const verifyForm = $('#verify-form', HTMLFormElement);
  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formValues(verifyForm);
    try {
      await api<{ verified: boolean }>('/api/v1/auth/verify-email', { method: 'POST', body: payload });
      const loginForm = $('#login-form', HTMLFormElement);
      field(loginForm, 'email', HTMLInputElement).value = payload.email ?? '';
      setAuthTab('login');
      setStatus(loginForm, 'Email подтверждён. Теперь войдите.');
    } catch (error) {
      setStatus(verifyForm, messageOf(error));
    }
  });

  const loginForm = $('#login-form', HTMLFormElement);
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api<LoginResult>('/api/v1/auth/login', { method: 'POST', body: formValues(loginForm) });
      state.user = result.user;
      updateAuthChrome();
      $('#auth-dialog', HTMLDialogElement).close();
      toast('Вы вошли в защищённый контур');
      await openAccount();
    } catch (error) {
      setStatus(loginForm, messageOf(error));
    }
  });

  const candidateForm = $('#candidate-profile-form', HTMLFormElement);
  candidateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formValues(candidateForm);
    const payload = {
      ...values,
      years_experience: Number(values.years_experience),
      stack: commaList(values.stack ?? ''),
      roles: commaList(values.roles ?? ''),
      soft_skills: commaList(values.soft_skills ?? ''),
      fsp_id: values.fsp_id || null,
      consent_processing: field(candidateForm, 'consent_processing', HTMLInputElement).checked,
      consent_publication: field(candidateForm, 'consent_publication', HTMLInputElement).checked,
      profile_visible: field(candidateForm, 'profile_visible', HTMLInputElement).checked,
    };
    try {
      const saved = await api<SavedCandidateAccount>('/api/v1/account/candidate-profile', {
        method: 'PUT',
        body: payload,
      });
      state.account = saved;
      $('#assessment-grade', HTMLSelectElement).value = saved.profile.claimed_grade;
      setStatus(candidateForm, 'Профиль сохранён');
      toast('Профиль и настройки приватности обновлены');
      state.candidates = await api<CandidateSummary[]>('/api/v1/candidates');
      await loadAccountState();
    } catch (error) {
      setStatus(candidateForm, messageOf(error));
    }
  });

  $('#connect-fsp').addEventListener('click', async () => {
    try {
      if (!candidateProfile()) {
        toast('Сначала сохраните профиль кандидата');
        return;
      }
      const connection = await api<FspConnection>('/api/v1/integrations/fsp/connect/start', { method: 'POST' });
      window.location.assign(connection.authorize_url);
    } catch (error) {
      toast(messageOf(error));
    }
  });

  const employerForm = $('#employer-profile-form', HTMLFormElement);
  employerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api<Account>('/api/v1/account/employer-profile', { method: 'PUT', body: formValues(employerForm) });
      setStatus(employerForm, 'Компания сохранена');
      toast('Теперь можно создавать вакансии и приглашения');
      await loadAccountState();
    } catch (error) {
      setStatus(employerForm, messageOf(error));
    }
  });

  const assessmentForm = $('#assessment-form', HTMLFormElement);
  $('#start-assessment').addEventListener('click', async () => {
    try {
      const attempt = await api<AssessmentAttempt>('/api/v1/assessments/start', {
        method: 'POST',
        body: { target_grade: $('#assessment-grade', HTMLSelectElement).value },
      });
      state.assessmentId = attempt.id;
      $('#assessment-questions').innerHTML = attempt.questions
        .map(
          (question, index) =>
            `<fieldset class="question-card"><legend>${index + 1}. ${html(question.prompt)}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${html(question.id)}" value="${optionIndex}" required> ${html(option)}</label>`).join('')}</fieldset>`,
        )
        .join('');
      assessmentForm.hidden = false;
      $('#assessment-result').innerHTML = '';
    } catch (error) {
      toast(messageOf(error));
    }
  });
  assessmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const answers: Record<string, number> = {};
    for (const [key, value] of new FormData(assessmentForm)) answers[key] = Number(value);
    try {
      const result = await api<AssessmentResult>(`/api/v1/assessments/${state.assessmentId}/submit`, {
        method: 'POST',
        body: { answers },
      });
      $('#assessment-result').innerHTML =
        `<div class="assessment-outcome ${result.passed ? 'passed' : 'failed'}"><strong>${result.passed ? 'Грейд подтверждён' : 'Грейд пока не подтверждён'}</strong><span>${Math.round(result.score * 100)}% · рекомендация: ${html(result.recommended_grade)}</span></div>`;
      assessmentForm.hidden = true;
      state.candidates = await api<CandidateSummary[]>('/api/v1/candidates');
      await loadAccountState();
    } catch (error) {
      setStatus(assessmentForm, messageOf(error));
    }
  });

  const applicationForm = $('#application-form', HTMLFormElement);
  applicationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api<Created>('/api/v1/applications', { method: 'POST', body: formValues(applicationForm) });
      setStatus(applicationForm, 'Отклик отправлен');
      window.setTimeout(() => $('#application-dialog', HTMLDialogElement).close(), 600);
      await loadAccountState();
    } catch (error) {
      setStatus(applicationForm, messageOf(error));
    }
  });
}
