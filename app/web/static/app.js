const state = {
  catalog: { skills: [], competitions: [] },
  vacancies: [],
  candidates: [],
  matches: [],
  vacancyId: null,
  category: "Все",
  search: "",
  candidateId: "alina",
  user: null,
  accountProfile: null,
  ownedVacancies: [],
  assessmentId: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const skillById = (id) => state.catalog.skills.find((item) => item.id === id);
const competitionById = (id) => state.catalog.competitions.find((item) => item.id === id);
const vacancyById = (id) => state.vacancies.find((item) => item.id === id);
const initials = (name) => name.split(" ").map((part) => part[0]).slice(0, 2).join("");
const money = (value) => `${Math.round(value / 1000)}к ₽`;
const percent = (value) => `${Math.round(value * 100)}%`;
const formatLabel = { remote: "удалённо", hybrid: "гибрид", office: "офис" };
const html = (value) => String(value ?? "").replace(/[&<>"']/g, (symbol) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[symbol]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
    throw new Error(detail || "Не удалось выполнить запрос");
  }
  if (response.status === 204) return null;
  return response.json();
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2600);
}

function renderVacancies() {
  $("#vacancy-list").innerHTML = state.vacancies.map((vacancy) => `
    <button class="vacancy-card ${vacancy.id === state.vacancyId ? "active" : ""}" data-vacancy="${html(vacancy.id)}">
      <span class="vacancy-meta"><span>${html(vacancy.employer)}</span><span>${html(formatLabel[vacancy.work_format] || vacancy.work_format)}</span></span>
      <h3>${html(vacancy.title)}</h3>
      <span class="vacancy-salary">${money(vacancy.salary_from)} — ${money(vacancy.salary_to)}</span>
    </button>
  `).join("");
  $$('[data-vacancy]').forEach((button) => button.addEventListener("click", () => selectVacancy(button.dataset.vacancy)));
}

function renderFilters() {
  const categories = ["Все", ...new Set(state.candidates.flatMap((item) => [
    ...item.profile.categories,
    ...(item.tested_category ? [item.tested_category] : []),
  ]))];
  $("#category-filters").innerHTML = categories.map((category) => `
    <button class="filter-chip ${state.category === category ? "active" : ""}" data-category="${html(category)}">${html(category)}</button>
  `).join("");
  $$('[data-category]').forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    renderFilters();
    renderCandidates();
  }));
}

function renderCandidates() {
  const query = state.search.trim().toLocaleLowerCase("ru");
  const matches = state.matches.filter((item) => {
    const categoryMatch = state.category === "Все"
      || item.match.profile.categories.includes(state.category)
      || item.tested_category === state.category;
    const haystack = [item.name, item.city, item.desired_role, ...item.stack].join(" ").toLocaleLowerCase("ru");
    return categoryMatch && (!query || haystack.includes(query));
  });
  if (!matches.length) {
    $("#candidate-grid").innerHTML = '<div class="empty-state">В этой категории пока никого. Снимите фильтр или выберите другую вакансию.</div>';
    return;
  }
  $("#candidate-grid").innerHTML = matches.map((candidate) => {
    const topSkills = Object.values(candidate.match.profile.skills).sort((a, b) => b.level - a.level).slice(0, 3);
    return `
      <article class="candidate-card">
        <div class="candidate-head">
          <div class="avatar">${html(initials(candidate.name))}</div>
          <div class="score-ring" style="--score:${candidate.match.score}" aria-label="Совпадение ${candidate.match.score} процентов">${Math.round(candidate.match.score)}</div>
        </div>
        <h3>${html(candidate.name)}</h3>
        <div class="candidate-role">${html(candidate.desired_role)} · ${html(candidate.city)}</div>
        <div class="candidate-proofline">${candidate.tested_category ? `Тест: ${html(candidate.tested_category)}` : "Демо-профиль"} · ${candidate.has_fsp_history ? "есть история ФСП" : "без истории ФСП"}</div>
        <div class="tag-row">${topSkills.map((skill) => `<span class="tag">${html(skillById(skill.skill_id)?.name || skill.skill_id)} ${percent(skill.level)}</span>`).join("")}</div>
        <div class="candidate-foot">
          <span>${candidate.match.critical_gaps ? `критичных пробелов: ${candidate.match.critical_gaps}` : "критичные навыки закрыты"}</span>
          <button class="link-button" data-candidate="${html(candidate.id)}">Профиль →</button>
        </div>
      </article>
    `;
  }).join("");
  $$('[data-candidate]').forEach((button) => button.addEventListener("click", () => openCandidate(button.dataset.candidate)));
}

async function selectVacancy(id) {
  state.vacancyId = id;
  renderVacancies();
  $("#candidate-grid").innerHTML = '<div class="empty-state">Пересчитываем графы доказательств…</div>';
  state.matches = await api(`/api/v1/vacancies/${encodeURIComponent(id)}/matches`);
  renderFilters();
  renderCandidates();
}

async function openCandidate(id) {
  const candidate = await api(`/api/v1/candidates/${encodeURIComponent(id)}?vacancy_id=${encodeURIComponent(state.vacancyId)}`);
  const score = candidate.match.score;
  const skills = Object.values(candidate.match.profile.skills).sort((a, b) => b.level - a.level).slice(0, 6);
  $("#candidate-detail").innerHTML = `
    <div class="detail-hero">
      <div class="avatar">${html(initials(candidate.name))}</div>
      <h2>${html(candidate.name)}</h2>
      <div>${html(candidate.desired_role)} · ${html(candidate.city)} · ${html(formatLabel[candidate.work_format] || candidate.work_format)}</div>
    </div>
    <div class="detail-body">
      <div class="detail-score">
        <div class="score-ring" style="--score:${score}">${Math.round(score)}</div>
        <div><p class="eyebrow blue">Совпадение с вакансией</p><h3>${candidate.match.critical_gaps ? `${candidate.match.critical_gaps} критичных пробела` : "Критичные требования закрыты"}</h3><p class="quiet">${html(candidate.about)}</p></div>
      </div>
      <div class="detail-skills">${skills.map((skill) => `<div class="skill-bar"><div><span>${html(skillById(skill.skill_id)?.name)}</span><span>${percent(skill.level)} · доверие ${percent(skill.confidence)}</span></div><div class="progress"><i style="width:${percent(skill.level)}"></i></div></div>`).join("")}</div>
      <div class="detail-actions">${candidate.tested_category
        ? `<button class="button button-dark" data-offer="${html(candidate.id)}">Сделать предложение · ${money(vacancyById(state.vacancyId).salary_from)}+</button>`
        : '<div class="demo-boundary">Это демонстрационный профиль. Приглашения доступны зарегистрированным кандидатам.</div>'}</div>
    </div>`;
  $("#candidate-dialog").showModal();
  $('[data-offer]')?.addEventListener("click", () => openOffer(id));
}

async function openOffer(candidateId) {
  if (!state.user || state.user.role !== "employer") {
    $("#candidate-dialog").close();
    openAuth("login", "Войдите как работодатель, чтобы отправить приглашение");
    return;
  }
  await loadAccountState();
  $("#candidate-dialog").close();
  const form = $("#offer-form");
  form.candidate_id.value = candidateId;
  form.vacancy_id.innerHTML = '<option value="">Без привязки к вакансии</option>' + state.ownedVacancies.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join("");
  const vacancy = state.ownedVacancies[0] || vacancyById(state.vacancyId);
  if (state.ownedVacancies[0]) form.vacancy_id.value = state.ownedVacancies[0].id;
  form.position_title.value = vacancy?.title || "ИТ-специалист";
  form.salary_from.value = vacancy.salary_from;
  form.salary_to.value = vacancy.salary_to;
  form.contact_method.value = state.accountProfile?.contact_method || "";
  $(".form-status", form).textContent = "";
  $("#offer-dialog").showModal();
}

function switchView(view) {
  $$('.role-button').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$('.view').forEach((element) => element.classList.toggle("active", element.id === `${view}-view`));
  if (view === "candidate") loadCandidateDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAccountView() {
  $$('.role-button').forEach((button) => button.classList.remove("active"));
  $$('.view').forEach((element) => element.classList.toggle("active", element.id === "account-view"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderGraph(graph) {
  const svg = $("#skill-graph");
  const width = 720;
  const height = 390;
  const colors = { Backend: "#315cff", "AI / ML": "#9b7bff", "Системная разработка": "#ff654f", "Product Engineering": "#caff49", "Кибербезопасность": "#ffb52e" };
  const positions = new Map(graph.nodes.map((node, index) => {
    const angle = index / Math.max(graph.nodes.length, 1) * Math.PI * 2 - Math.PI / 2;
    const radius = graph.nodes.length < 4 ? 120 : 145;
    return [node.id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }];
  }));
  const edges = graph.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return from && to ? `<line class="graph-edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>` : "";
  }).join("");
  const nodes = graph.nodes.map((node) => {
    const point = positions.get(node.id);
    const radius = 28 + node.level * 24;
    const color = colors[node.category] || "#315cff";
    const label = node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label;
    return `<g class="graph-node" transform="translate(${point.x} ${point.y})"><circle r="${radius}" fill="${color}" stroke="rgba(255,255,255,${node.confidence})"/><text y="-2">${html(label)}</text><text class="graph-score" y="15">${percent(node.level)} · ${percent(node.confidence)}</text></g>`;
  }).join("");
  svg.innerHTML = `${edges}${nodes}`;
}

async function loadCandidateDashboard() {
  const vacancyId = $("#candidate-vacancy").value || state.vacancyId;
  const candidate = await api(`/api/v1/candidates/${encodeURIComponent(state.candidateId)}?vacancy_id=${encodeURIComponent(vacancyId)}`);
  $("#profile-summary").innerHTML = `<div class="avatar">${html(initials(candidate.name))}</div><h2>${html(candidate.name)}</h2><p>${html(candidate.desired_role)} · ${html(candidate.city)}<br>${html(candidate.about)}</p><div class="profile-stack">${candidate.stack.map((item) => `<span>${html(item)}</span>`).join("")}</div>`;
  renderGraph(candidate.graph);
  const vacancy = vacancyById(vacancyId);
  const gaps = candidate.match.gaps.slice(0, 4);
  $("#candidate-match").innerHTML = `<div class="match-big"><strong>${Math.round(candidate.match.score)}</strong><span>/ 100 match</span></div><div class="progress"><i style="width:${candidate.match.score}%"></i></div><div class="gap-list">${gaps.length ? gaps.map((gap) => `<div class="gap-item"><span>${html(skillById(gap.skill_id)?.name)}</span><span>−${percent(gap.deficit)}</span></div>`).join("") : '<p class="quiet">Все требования подтверждены. Можно идти на интервью.</p>'}</div><p class="quiet">${html(vacancy.title)} · ${html(vacancy.employer)}</p>`;
  $("#recommendations").innerHTML = candidate.recommendations.length ? candidate.recommendations.slice(0, 2).map((item) => { const competition = competitionById(item.competition_id); return `<div class="recommendation"><strong>${html(competition?.name || item.competition_id)}</strong><span>Подтвердит: ${item.closes_skills.map((id) => html(skillById(id)?.name)).join(", ")}</span></div>`; }).join("") : '<p class="quiet">Граф цели закрыт. Выберите более сложную вакансию — найдём следующий шаг.</p>';
  $("#evidence-list").innerHTML = candidate.evidence.map((item) => `<div class="evidence-row"><div class="place">#${item.placement}</div><div><strong>${html(item.competition)}</strong><span>${html(item.discipline)} · роль: ${html(item.role)}${item.rank ? ` · разряд ${html(item.rank)}` : ""}</span></div><span class="verified">${item.source === "fsp" ? "ФСП · mock" : html(item.source)}</span></div>`).join("");
  const demoOffers = candidate.offers || [];
  $("#offer-count").textContent = demoOffers.length;
  $("#offer-list").innerHTML = demoOffers.length ? demoOffers.map((item) => `<div class="offer-item"><strong>${html(item.title)}</strong><span>${html(item.employer)} · ${money(item.salary_from)} — ${money(item.salary_to)}</span></div>`).join("") : '<p class="quiet">Это демонстрация кабинета. Реальные приглашения доступны после регистрации.</p>';
}

function bindForms() {
  $("#offer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.salary_from = Number(data.salary_from);
    data.salary_to = Number(data.salary_to);
    const payload = {
      candidate_id: data.candidate_id,
      vacancy_id: data.vacancy_id || null,
      position_title: data.position_title,
      salary_from: data.salary_from,
      salary_to: data.salary_to,
      description: data.message,
      contact_method: data.contact_method,
    };
    try {
      await api("/api/v1/invitations", { method: "POST", body: JSON.stringify(payload) });
      $(".form-status", form).textContent = "Предложение отправлено";
      window.setTimeout(() => $("#offer-dialog").close(), 700);
      toast("Предложение появилось у кандидата");
      await loadAccountState();
    } catch (error) {
      $(".form-status", form).textContent = error.message;
    }
  });

  $("#vacancy-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const requirements = $$(".requirement-editor", form).map((row) => ({
      skill_id: $("[name=skill_id]", row).value,
      level: Number($("[name=level]", row).value) / 100,
      criticality: Number($("[name=criticality]", row).value),
    }));
    const competitionIds = $$('[name="competition_ids"]:checked', form).map((input) => input.value);
    const payload = {
      id: `vacancy-${Date.now()}`,
      employer: data.employer,
      title: data.title,
      grade: data.grade,
      work_format: data.work_format,
      salary_from: Number(data.salary_from),
      salary_to: Number(data.salary_to),
      requirements,
      evidence_policy: { mode: data.policy_mode, competition_ids: competitionIds },
    };
    try {
      const created = await api("/api/v1/vacancies", { method: "POST", body: JSON.stringify(payload) });
      state.vacancies = await api("/api/v1/vacancies");
      state.vacancyId = created.id;
      renderVacancies();
      await selectVacancy(created.id);
      $(".form-status", form).textContent = "Вакансия создана";
      window.setTimeout(() => $("#vacancy-dialog").close(), 600);
      toast("Граф требований готов — подбор пересчитан");
      await loadAccountState();
    } catch (error) {
      $(".form-status", form).textContent = error.message;
    }
  });
}

function addRequirement(skillId = "", level = 70, criticality = 4) {
  const row = document.createElement("div");
  row.className = "requirement-editor";
  row.innerHTML = `
    <label>Навык<select name="skill_id">${state.catalog.skills.map((item) => `<option value="${html(item.id)}" ${item.id === skillId ? "selected" : ""}>${html(item.name)}</option>`).join("")}</select></label>
    <label>Уровень <output>${level}%</output><input name="level" type="range" min="20" max="100" value="${level}"></label>
    <label>Критичность <output>${criticality} / 5</output><input name="criticality" type="range" min="1" max="5" value="${criticality}"></label>
    <button class="remove-requirement" type="button" aria-label="Удалить навык">×</button>`;
  $("[name=level]", row).addEventListener("input", (event) => $("output", event.target.closest("label")).textContent = `${event.target.value}%`);
  $("[name=criticality]", row).addEventListener("input", (event) => $("output", event.target.closest("label")).textContent = `${event.target.value} / 5`);
  $(".remove-requirement", row).addEventListener("click", () => {
    if ($$(".requirement-editor").length > 1) row.remove();
  });
  $("#requirement-builder").append(row);
}

function renderCompetitionOptions() {
  $("#competition-options").innerHTML = state.catalog.competitions.map((item) => `
    <label><input type="checkbox" name="competition_ids" value="${html(item.id)}"> <span>${html(item.name)}</span></label>
  `).join("");
}

function setAuthTab(tab) {
  $$('[data-auth-tab]').forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
  $("#login-form").hidden = tab !== "login";
  $("#register-form").hidden = tab !== "register";
  $("#verify-form").hidden = tab !== "verify";
}

function openAuth(tab = "login", message = "") {
  setAuthTab(tab);
  if (message) $(".form-status", $("#login-form")).textContent = message;
  $("#auth-dialog").showModal();
}

function updateAuthChrome() {
  $("#open-auth").hidden = Boolean(state.user);
  $("#open-account").hidden = !state.user;
  if (state.user) $("#open-account").textContent = state.user.display_name;
}

async function restoreSession() {
  const session = await api("/api/v1/auth/session");
  state.user = session.authenticated ? session.user : null;
  updateAuthChrome();
}

function fillForm(form, values) {
  if (!values) return;
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else if (Array.isArray(value)) field.value = value.join(", ");
    else field.value = value ?? "";
  });
}

function commaList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function invitationCard(item, candidateMode) {
  const actions = candidateMode && ["sent", "viewed"].includes(item.status)
    ? `<div class="inline-actions"><button data-invitation-status="accepted" data-id="${item.id}">Принять</button><button data-invitation-status="rejected" data-id="${item.id}">Отклонить</button></div>`
    : "";
  return `<div class="record-card"><div><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.position_title)}</strong><p>${html(item.company_name)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div><p>${html(item.description)}</p>${candidateMode ? `<small>Связь: ${html(item.contact_method)}</small>` : `<small>${item.candidate_name ? html(item.candidate_name) : "Кандидат"}${item.candidate_contact ? ` · ${html(item.candidate_contact)}` : " · контакт откроется после принятия"}</small>`}${actions}</div>`;
}

function renderCandidateAccount(invitations, applications) {
  $("#real-invitation-count").textContent = invitations.length;
  $("#real-invitations").innerHTML = invitations.length
    ? invitations.map((item) => invitationCard(item, true)).join("")
    : '<p class="quiet">Приглашений пока нет. После публикации профиль появится в банке работодателей.</p>';
  $("#real-applications").innerHTML = applications.length
    ? applications.map((item) => `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.title)}</strong><p>${html(item.employer)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div>`).join("")
    : '<p class="quiet">Вы пока не откликались. Основная механика сервиса — приглашения работодателей.</p>';
  const applied = new Set(applications.map((item) => item.vacancy_id));
  const vacancies = state.vacancies.filter((item) => item.accepts_applications);
  $("#real-vacancies").innerHTML = vacancies.length
    ? vacancies.map((item) => `<div class="real-vacancy"><div><small>${html(item.employer)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-apply="${html(item.id)}" ${applied.has(item.id) ? "disabled" : ""}>${applied.has(item.id) ? "Отклик отправлен" : "Откликнуться"}</button></div>`).join("")
    : '<p class="quiet">Опубликованных вакансий зарегистрированных работодателей пока нет.</p>';
  $$('[data-invitation-status]').forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/v1/invitations/${button.dataset.id}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.invitationStatus }) });
    toast(button.dataset.invitationStatus === "accepted" ? "Приглашение принято — контакт открыт" : "Приглашение отклонено");
    await loadAccountState();
  }));
  $$('[data-apply]').forEach((button) => button.addEventListener("click", () => {
    const vacancy = vacancyById(button.dataset.apply);
    $("#application-form").vacancy_id.value = vacancy.id;
    $("#application-title").textContent = `Отклик: ${vacancy.title}`;
    $("#application-dialog").showModal();
  }));
}

function renderEmployerAccount(invitations, applications) {
  $("#employer-invitations").innerHTML = invitations.length
    ? invitations.map((item) => invitationCard(item, false)).join("")
    : '<p class="quiet">Откройте подборку и пригласите первого зарегистрированного кандидата.</p>';
  $("#employer-applications").innerHTML = applications.length
    ? applications.map((item) => `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.candidate_name)}</strong><p>${html(item.title)} · ${html(item.candidate_contact)}</p>${["submitted", "viewed"].includes(item.status) ? `<div class="inline-actions"><button data-application-status="accepted" data-id="${item.id}">Принять</button><button data-application-status="rejected" data-id="${item.id}">Отклонить</button></div>` : ""}</div>`).join("")
    : '<p class="quiet">Входящих откликов пока нет.</p>';
  $("#owned-vacancies").innerHTML = state.ownedVacancies.length
    ? state.ownedVacancies.map((item) => `<div class="real-vacancy"><div><small>${html(item.grade)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-owned-match="${html(item.id)}">Подобрать</button></div>`).join("")
    : '<p class="quiet">Создайте первую вакансию с обязательной зарплатной вилкой.</p>';
  $$('[data-application-status]').forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/v1/applications/${button.dataset.id}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.applicationStatus }) });
    toast("Статус отклика обновлён");
    await loadAccountState();
  }));
  $$('[data-owned-match]').forEach((button) => button.addEventListener("click", async () => {
    state.vacancyId = button.dataset.ownedMatch;
    switchView("employer");
    await selectVacancy(state.vacancyId);
    $("#workspace").scrollIntoView({ behavior: "smooth" });
  }));
}

async function loadAccountState() {
  if (!state.user) return;
  const account = await api("/api/v1/account/profile");
  state.accountProfile = account.profile;
  $("#account-title").textContent = `Здравствуйте, ${state.user.display_name}`;
  $("#account-subtitle").textContent = state.user.role === "candidate"
    ? "Подтвердите специализацию — и работодатели смогут пригласить вас напрямую."
    : "Опишите команду, сформируйте граф требований и инициируйте контакт.";
  $("#candidate-account").hidden = state.user.role !== "candidate";
  $("#employer-account").hidden = state.user.role !== "employer";
  if (state.user.role === "candidate") {
    const form = $("#candidate-profile-form");
    if (state.accountProfile) fillForm(form, state.accountProfile);
    else form.contact_email.value = state.user.email;
    $("#verified-grade").textContent = state.accountProfile?.verified_grade || "не пройдено";
    $("#download-profile").hidden = !state.accountProfile;
    if (state.accountProfile) $("#assessment-grade").value = state.accountProfile.claimed_grade;
    const [invitations, applications] = await Promise.all([
      api("/api/v1/invitations"), api("/api/v1/applications"),
    ]);
    renderCandidateAccount(invitations, applications);
  } else {
    if (state.accountProfile) fillForm($("#employer-profile-form"), state.accountProfile);
    [state.ownedVacancies] = await Promise.all([api("/api/v1/account/vacancies")]);
    const [invitations, applications] = await Promise.all([
      api("/api/v1/invitations"), api("/api/v1/applications"),
    ]);
    renderEmployerAccount(invitations, applications);
  }
}

async function openAccount() {
  if (!state.user) {
    openAuth();
    return;
  }
  await loadAccountState();
  showAccountView();
}

function openVacancyEditor() {
  if (!state.user || state.user.role !== "employer") {
    openAuth("login", "Войдите как работодатель, чтобы создать вакансию");
    return;
  }
  if (!state.accountProfile) {
    toast("Сначала заполните профиль компании");
    return;
  }
  const form = $("#vacancy-form");
  form.employer.value = state.accountProfile.company_name;
  form.employer.readOnly = true;
  $("#vacancy-dialog").showModal();
}

function bindAccountForms() {
  $$('[data-auth-tab]').forEach((button) => button.addEventListener("click", () => setAuthTab(button.dataset.authTab)));
  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const result = await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
      $("#verify-form").email.value = payload.email;
      $("#verification-note").innerHTML = result.verification_delivery === "demo_outbox"
        ? `Почтовый сервер в публичном демо не настроен. Код из прозрачного demo-outbox: <strong>${html(result.verification_code)}</strong>`
        : "Мы отправили код на указанный email.";
      setAuthTab("verify");
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#verify-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      await api("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify(payload) });
      $("#login-form").email.value = payload.email;
      setAuthTab("login");
      $(".form-status", $("#login-form")).textContent = "Email подтверждён. Теперь войдите.";
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      state.user = result.user;
      updateAuthChrome();
      $("#auth-dialog").close();
      toast("Вы вошли в защищённый контур");
      await openAccount();
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#candidate-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      ...values,
      years_experience: Number(values.years_experience),
      stack: commaList(values.stack), roles: commaList(values.roles || ""), soft_skills: commaList(values.soft_skills || ""),
      fsp_id: values.fsp_id || null,
      consent_processing: form.consent_processing.checked,
      consent_publication: form.consent_publication.checked,
      profile_visible: form.profile_visible.checked,
    };
    try {
      const saved = await api("/api/v1/account/candidate-profile", { method: "PUT", body: JSON.stringify(payload) });
      state.accountProfile = saved.profile;
      $("#assessment-grade").value = saved.profile.claimed_grade;
      $(".form-status", form).textContent = "Профиль сохранён";
      toast("Профиль и настройки приватности обновлены");
      state.candidates = await api("/api/v1/candidates");
      await loadAccountState();
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#employer-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/v1/account/employer-profile", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      $(".form-status", form).textContent = "Компания сохранена";
      toast("Теперь можно создавать вакансии и приглашения");
      await loadAccountState();
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#start-assessment").addEventListener("click", async () => {
    try {
      const attempt = await api("/api/v1/assessments/start", { method: "POST", body: JSON.stringify({ target_grade: $("#assessment-grade").value }) });
      state.assessmentId = attempt.id;
      $("#assessment-questions").innerHTML = attempt.questions.map((question, index) => `<fieldset class="question-card"><legend>${index + 1}. ${html(question.prompt)}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${html(question.id)}" value="${optionIndex}" required> ${html(option)}</label>`).join("")}</fieldset>`).join("");
      $("#assessment-form").hidden = false;
      $("#assessment-result").innerHTML = "";
    } catch (error) { toast(error.message); }
  });
  $("#assessment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const answers = {};
    new FormData(form).forEach((value, key) => { answers[key] = Number(value); });
    try {
      const result = await api(`/api/v1/assessments/${state.assessmentId}/submit`, { method: "POST", body: JSON.stringify({ answers }) });
      $("#assessment-result").innerHTML = `<div class="assessment-outcome ${result.passed ? "passed" : "failed"}"><strong>${result.passed ? "Грейд подтверждён" : "Грейд пока не подтверждён"}</strong><span>${Math.round(result.score * 100)}% · рекомендация: ${html(result.recommended_grade)}</span></div>`;
      form.hidden = true;
      state.candidates = await api("/api/v1/candidates");
      await loadAccountState();
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
  $("#application-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/v1/applications", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      $(".form-status", form).textContent = "Отклик отправлен";
      window.setTimeout(() => $("#application-dialog").close(), 600);
      await loadAccountState();
    } catch (error) { $(".form-status", form).textContent = error.message; }
  });
}

async function boot() {
  try {
    [state.catalog, state.vacancies, state.candidates] = await Promise.all([
      api("/api/v1/catalog"), api("/api/v1/vacancies"), api("/api/v1/candidates"),
    ]);
    state.vacancyId = state.vacancies[0].id;
    $("#candidate-count").textContent = state.candidates.length;
    $("#competition-count").textContent = new Set(state.catalog.competitions.map((item) => item.source)).size;
    $("#persona-select").innerHTML = state.candidates.map((item) => `<option value="${html(item.id)}">${html(item.name)}</option>`).join("");
    $("#candidate-vacancy").innerHTML = state.vacancies.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join("");
    addRequirement("python", 70, 5);
    addRequirement("algorithms", 60, 4);
    renderCompetitionOptions();
    renderVacancies();
    await selectVacancy(state.vacancyId);
    await restoreSession();
  } catch (error) {
    $("#candidate-grid").innerHTML = `<div class="empty-state">${html(error.message)}. Обновите страницу.</div>`;
  }
}

$$('.role-button').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$$('[data-close]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$$('dialog').forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
$("#start-search").addEventListener("click", () => $("#workspace").scrollIntoView({ behavior: "smooth" }));
$("#hero-register").addEventListener("click", () => openAuth("register"));
$("#open-auth").addEventListener("click", () => openAuth("login"));
$("#open-account").addEventListener("click", openAccount);
$("#account-new-vacancy").addEventListener("click", openVacancyEditor);
$("#find-candidates").addEventListener("click", () => switchView("employer"));
$("#back-to-demo").addEventListener("click", () => switchView(state.user?.role === "candidate" ? "candidate" : "employer"));
$("#logout").addEventListener("click", async () => {
  await api("/api/v1/auth/logout", { method: "POST" });
  state.user = null;
  state.accountProfile = null;
  state.ownedVacancies = [];
  updateAuthChrome();
  switchView("employer");
  toast("Сессия завершена");
});
$("#open-data").addEventListener("click", () => $("#data-dialog").showModal());
$("#candidate-search").addEventListener("input", (event) => { state.search = event.target.value; renderCandidates(); });
$("#persona-select").addEventListener("change", (event) => { state.candidateId = event.target.value; loadCandidateDashboard(); });
$("#candidate-vacancy").addEventListener("change", loadCandidateDashboard);
$("#add-requirement").addEventListener("click", () => addRequirement());
$("#vacancy-form [name=policy_mode]").addEventListener("change", (event) => {
  $("#competition-policy").hidden = event.target.value !== "allowlist";
});
bindForms();
bindAccountForms();
boot();
