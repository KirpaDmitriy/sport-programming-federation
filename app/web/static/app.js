// Generated from app/web/client/src by `bun run build` in app/web/client. Do not edit.

// src/api.ts
var isRecord = (value) => typeof value === "object" && value !== null;
function errorDetail(payload) {
  if (!isRecord(payload))
    return;
  const { detail } = payload;
  if (typeof detail === "string")
    return detail;
  if (isRecord(detail) && typeof detail.message === "string")
    return detail.message;
  return;
}
async function request(path, { method, body }) {
  const response = await fetch(path, {
    method: method ?? "GET",
    headers: { "Content-Type": "application/json" },
    ...body === undefined ? {} : { body: JSON.stringify(body) }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(errorDetail(payload) || "Не удалось выполнить запрос");
  }
  return response;
}
async function api(path, options = {}) {
  const response = await request(path, options);
  return await response.json();
}
async function send(path, options = {}) {
  await request(path, options);
}
var messageOf = (error) => error instanceof Error ? error.message : String(error);

// src/dom.ts
function $(selector, typeOrRoot, root) {
  const type = typeof typeOrRoot === "function" ? typeOrRoot : HTMLElement;
  const scope = (typeof typeOrRoot === "function" ? root : typeOrRoot) ?? document;
  const element = scope.querySelector(selector);
  if (!(element instanceof type))
    throw new Error(`Element not found: ${selector}`);
  return element;
}
function $$(selector, typeOrRoot, root) {
  const type = typeof typeOrRoot === "function" ? typeOrRoot : HTMLElement;
  const scope = (typeof typeOrRoot === "function" ? root : typeOrRoot) ?? document;
  return [...scope.querySelectorAll(selector)].filter((element) => element instanceof type);
}
function dataOf(element, key) {
  const value = element.dataset[key];
  if (value === undefined)
    throw new Error(`Missing data attribute: ${key}`);
  return value;
}
function field(form, name, type) {
  const element = form.elements.namedItem(name);
  if (!(element instanceof type))
    throw new Error(`Form field not found: ${name}`);
  return element;
}
function formValues(form) {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
}
function formReader(form) {
  const data = new FormData(form);
  return (name) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
}
function setStatus(form, message) {
  $(".form-status", form).textContent = message;
}
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2600);
}

// src/format.ts
var entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var html = (value) => String(value ?? "").replace(/[&<>"']/g, (symbol) => entities[symbol] ?? symbol);
var initials = (name) => name.split(" ").map((part) => part[0]).slice(0, 2).join("");
var money = (value) => `${Math.round(value / 1000)}к ₽`;
var percent = (value) => `${Math.round(value * 100)}%`;
var formatLabel = { remote: "удалённо", hybrid: "гибрид", office: "офис" };

// src/state.ts
var state = {
  catalog: { skills: [], competitions: [] },
  vacancies: [],
  candidates: [],
  matches: [],
  vacancyId: null,
  category: "Все",
  search: "",
  specialization: "",
  grade: "",
  fsp: "",
  candidateId: "alina",
  user: null,
  account: null,
  ownedVacancies: [],
  assessmentId: null
};
var skillById = (id) => state.catalog.skills.find((item) => item.id === id);
var competitionById = (id) => state.catalog.competitions.find((item) => item.id === id);
var vacancyById = (id) => state.vacancies.find((item) => item.id === id);
function requireVacancy(id) {
  const vacancy = vacancyById(id);
  if (!vacancy)
    throw new Error(`Vacancy not loaded: ${id}`);
  return vacancy;
}
function selectedVacancyId() {
  if (!state.vacancyId)
    throw new Error("No vacancy selected");
  return state.vacancyId;
}
var candidateProfile = () => state.account?.role === "candidate" ? state.account.profile : null;
var employerProfile = () => state.account?.role === "employer" ? state.account.profile : null;

// src/employer.ts
function renderVacancies() {
  $("#vacancy-list").innerHTML = state.vacancies.map((vacancy) => `
    <button class="vacancy-card ${vacancy.id === state.vacancyId ? "active" : ""}" data-vacancy="${html(vacancy.id)}">
      <span class="vacancy-meta"><span>${html(vacancy.employer)}</span><span>${html(formatLabel[vacancy.work_format] || vacancy.work_format)}</span></span>
      <h3>${html(vacancy.title)}</h3>
      <span class="vacancy-salary">${money(vacancy.salary_from)} — ${money(vacancy.salary_to)}</span>
    </button>
  `).join("");
  for (const button of $$("[data-vacancy]")) {
    button.addEventListener("click", () => selectVacancy(dataOf(button, "vacancy")));
  }
}
function renderFilters() {
  const categories = [
    "Все",
    ...new Set(state.candidates.flatMap((item) => [
      ...item.profile.categories,
      ...item.tested_category ? [item.tested_category] : []
    ]))
  ];
  $("#category-filters").innerHTML = categories.map((category) => `
    <button class="filter-chip ${state.category === category ? "active" : ""}" data-category="${html(category)}">${html(category)}</button>
  `).join("");
  for (const button of $$("[data-category]")) {
    button.addEventListener("click", () => {
      state.category = dataOf(button, "category");
      renderFilters();
      renderCandidates();
    });
  }
}
function matchesFilters(item, query) {
  const categoryMatch = state.category === "Все" || item.match.profile.categories.includes(state.category) || item.tested_category === state.category;
  const haystack = [item.name, item.city, item.desired_role, ...item.stack].join(" ").toLocaleLowerCase("ru");
  const specializationMatch = !state.specialization || Boolean(item.tested_category?.startsWith(`${state.specialization}:`));
  const gradeMatch = !state.grade || item.verified_grade === state.grade || Boolean(item.tested_category?.endsWith(`:${state.grade}`));
  const fspMatch = !state.fsp || item.has_fsp_history === (state.fsp === "yes");
  return categoryMatch && specializationMatch && gradeMatch && fspMatch && (!query || haystack.includes(query));
}
function renderCandidates() {
  const query = state.search.trim().toLocaleLowerCase("ru");
  const matches = state.matches.filter((item) => matchesFilters(item, query));
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
        <div class="candidate-proofline"><span>Пример профиля</span> · ${candidate.tested_category ? `тест: ${html(candidate.tested_category)}` : "навыки из достижений"} · ${candidate.has_fsp_history ? "есть результаты соревнований" : "без результатов соревнований"}</div>
        <div class="tag-row">${topSkills.map((skill) => `<span class="tag">${html(skillById(skill.skill_id)?.name || skill.skill_id)} ${percent(skill.level)}</span>`).join("")}</div>
        <div class="candidate-foot">
          <span>${candidate.match.critical_gaps ? `критичных пробелов: ${candidate.match.critical_gaps}` : "критичные навыки закрыты"}</span>
          <button class="link-button" data-candidate="${html(candidate.id)}">Открыть профиль <span>↗</span></button>
        </div>
      </article>
    `;
  }).join("");
  for (const button of $$("[data-candidate]")) {
    button.addEventListener("click", () => openCandidate(dataOf(button, "candidate")));
  }
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
  const vacancyId = selectedVacancyId();
  const candidate = await api(`/api/v1/candidates/${encodeURIComponent(id)}?vacancy_id=${encodeURIComponent(vacancyId)}`);
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
      <div class="detail-actions">${candidate.tested_category ? `<button class="button button-dark" data-offer="${html(candidate.id)}">Сделать предложение · ${money(requireVacancy(vacancyId).salary_from)}+</button>` : '<div class="demo-boundary">Это демонстрационный профиль. Приглашения доступны зарегистрированным кандидатам.</div>'}</div>
    </div>`;
  $("#candidate-dialog", HTMLDialogElement).showModal();
  document.querySelector("[data-offer]")?.addEventListener("click", () => openOffer(id));
}
async function openOffer(candidateId) {
  const candidateDialog = $("#candidate-dialog", HTMLDialogElement);
  if (state.user?.role !== "employer") {
    candidateDialog.close();
    openAuth("login", "Войдите как работодатель, чтобы отправить приглашение");
    return;
  }
  await loadAccountState();
  candidateDialog.close();
  const form = $("#offer-form", HTMLFormElement);
  field(form, "candidate_id", HTMLInputElement).value = candidateId;
  const vacancySelect = field(form, "vacancy_id", HTMLSelectElement);
  vacancySelect.innerHTML = `<option value="">Без привязки к вакансии</option>${state.ownedVacancies.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join("")}`;
  const [owned] = state.ownedVacancies;
  const vacancy = owned || vacancyById(state.vacancyId);
  if (owned)
    vacancySelect.value = owned.id;
  field(form, "position_title", HTMLInputElement).value = vacancy?.title || "ИТ-специалист";
  field(form, "salary_from", HTMLInputElement).value = String(vacancy?.salary_from ?? "");
  field(form, "salary_to", HTMLInputElement).value = String(vacancy?.salary_to ?? "");
  field(form, "contact_method", HTMLInputElement).value = employerProfile()?.contact_method || "";
  setStatus(form, "");
  $("#offer-dialog", HTMLDialogElement).showModal();
}
function bindForms() {
  const offerForm = $("#offer-form", HTMLFormElement);
  offerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = formReader(offerForm);
    const payload = {
      candidate_id: value("candidate_id"),
      vacancy_id: value("vacancy_id") || null,
      position_title: value("position_title"),
      salary_from: Number(value("salary_from")),
      salary_to: Number(value("salary_to")),
      description: value("message"),
      contact_method: value("contact_method")
    };
    try {
      await api("/api/v1/invitations", { method: "POST", body: payload });
      setStatus(offerForm, "Предложение отправлено");
      window.setTimeout(() => $("#offer-dialog", HTMLDialogElement).close(), 700);
      toast("Предложение появилось у кандидата");
      await loadAccountState();
    } catch (error) {
      setStatus(offerForm, messageOf(error));
    }
  });
  const vacancyForm = $("#vacancy-form", HTMLFormElement);
  vacancyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = formReader(vacancyForm);
    const requirements = $$(".requirement-editor", vacancyForm).map((row) => ({
      skill_id: $("[name=skill_id]", HTMLSelectElement, row).value,
      level: Number($("[name=level]", HTMLInputElement, row).value) / 100,
      criticality: Number($("[name=criticality]", HTMLInputElement, row).value)
    }));
    const competitionIds = $$('[name="competition_ids"]:checked', HTMLInputElement, vacancyForm).map((input) => input.value);
    const payload = {
      id: `vacancy-${Date.now()}`,
      employer: value("employer"),
      title: value("title"),
      grade: value("grade"),
      specialization: value("specialization"),
      description: value("description"),
      team_description: value("team_description"),
      work_format: value("work_format"),
      salary_from: Number(value("salary_from")),
      salary_to: Number(value("salary_to")),
      requirements,
      evidence_policy: { mode: value("policy_mode"), competition_ids: competitionIds }
    };
    try {
      const created = await api("/api/v1/vacancies", { method: "POST", body: payload });
      state.vacancies = await api("/api/v1/vacancies");
      state.vacancyId = created.id;
      renderVacancies();
      await selectVacancy(created.id);
      setStatus(vacancyForm, "Вакансия создана");
      window.setTimeout(() => $("#vacancy-dialog", HTMLDialogElement).close(), 600);
      toast("Граф требований готов — подбор пересчитан");
      await loadAccountState();
    } catch (error) {
      setStatus(vacancyForm, messageOf(error));
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
  const bindRange = (name, format) => {
    const input = $(`[name=${name}]`, HTMLInputElement, row);
    const output = $("output", HTMLOutputElement, input.closest("label") ?? row);
    input.addEventListener("input", () => {
      output.textContent = format(input.value);
    });
  };
  bindRange("level", (value) => `${value}%`);
  bindRange("criticality", (value) => `${value} / 5`);
  $(".remove-requirement", row).addEventListener("click", () => {
    if ($$(".requirement-editor").length > 1)
      row.remove();
  });
  $("#requirement-builder").append(row);
}
function renderCompetitionOptions() {
  $("#competition-options").innerHTML = state.catalog.competitions.map((item) => `
    <label><input type="checkbox" name="competition_ids" value="${html(item.id)}"> <span>${html(item.name)}</span></label>
  `).join("");
}
async function draftVacancyGraph() {
  const form = $("#vacancy-form", HTMLFormElement);
  const value = formReader(form);
  const text = ["title", "grade", "specialization", "description", "team_description"].map((name) => value(name)).join(". ");
  setStatus(form, "Собираем граф требований…");
  try {
    const draft = await api("/api/v1/graph/vacancy-draft", { method: "POST", body: { text } });
    if (!draft.requirements.length) {
      setStatus(form, draft.warnings[0] ?? "");
      return;
    }
    $("#requirement-builder").innerHTML = "";
    for (const item of draft.requirements) {
      addRequirement(item.skill_id, Math.round(item.level * 100), item.criticality);
    }
    setStatus(form, `Граф собран: ${draft.requirements.length} навыков. Проверьте настройки перед сохранением.`);
  } catch (error) {
    setStatus(form, messageOf(error));
  }
}
function openVacancyEditor() {
  if (state.user?.role !== "employer") {
    openAuth("login", "Войдите как работодатель, чтобы создать вакансию");
    return;
  }
  const profile = employerProfile();
  if (!profile) {
    toast("Сначала заполните профиль компании");
    return;
  }
  const employer = field($("#vacancy-form", HTMLFormElement), "employer", HTMLInputElement);
  employer.value = profile.company_name;
  employer.readOnly = true;
  $("#vacancy-dialog", HTMLDialogElement).showModal();
}

// src/graph.ts
var colors = {
  Backend: "#315cff",
  "AI / ML": "#9b7bff",
  "Системная разработка": "#ff654f",
  "Product Engineering": "#caff49",
  Кибербезопасность: "#ffb52e"
};
function renderGraph(graph) {
  const svg = $("#skill-graph", SVGSVGElement);
  const width = 720;
  const height = 390;
  const maxDepth = Math.max(...graph.nodes.map((node) => node.depth || 0), 0);
  const columns = new Map;
  for (const node of graph.nodes) {
    const depth = node.depth || 0;
    const column = columns.get(depth) ?? [];
    column.push(node);
    columns.set(depth, column);
  }
  const positions = new Map;
  for (const [depth, nodes] of columns) {
    nodes.sort((left, right) => left.label.localeCompare(right.label, "ru"));
    const x = maxDepth ? 72 + depth * ((width - 144) / maxDepth) : width / 2;
    const spacing = Math.min(106, (height - 74) / Math.max(nodes.length, 1));
    const startY = height / 2 - spacing * (nodes.length - 1) / 2;
    for (const [index, node] of nodes.entries())
      positions.set(node.id, { x, y: startY + index * spacing });
  }
  const edges = graph.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to)
      return "";
    const middle = (from.x + to.x) / 2;
    return `<path class="graph-edge" d="M ${from.x + 43} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x - 49} ${to.y}" marker-end="url(#graph-arrow)"/>`;
  }).join("");
  const nodes = graph.nodes.map((node) => {
    const point = positions.get(node.id);
    if (!point)
      return "";
    const radius = 45;
    const missing = node.status === "gap" || node.status === "prerequisite_gap";
    const color = missing ? "#292930" : colors[node.category] || "#315cff";
    const lines = node.label.split(" ").reduce((result, word) => {
      const current = result.at(-1);
      if (!current || current.length + word.length + 1 > 15 && result.length < 2)
        result.push(word);
      else
        result[result.length - 1] = `${current} ${word}`;
      return result;
    }, []);
    const second = lines[1];
    if (second && second.length > 15)
      lines[1] = `${second.slice(0, 14)}…`;
    const fontSize = node.label.length > 24 ? 10 : 11;
    const labelY = lines.length === 1 ? -4 : -11;
    const label = lines.map((line, index) => `<tspan x="0" dy="${index ? 13 : 0}">${html(line)}</tspan>`).join("");
    const scoreY = lines.length === 1 ? 15 : 21;
    const lightNode = !missing && (node.category === "Product Engineering" || node.category === "Кибербезопасность");
    const score = node.is_requirement ? `${percent(node.confirmed_level)} / ${percent(node.required_level ?? 0)}` : node.status === "confirmed" ? `${percent(node.confirmed_level)} подтверждено` : "нужен пререквизит";
    return `<g class="graph-node graph-${node.status}${lightNode ? " graph-node-light" : ""}" transform="translate(${point.x} ${point.y})"><circle r="${radius}" fill="${color}"/><text class="graph-label" y="${labelY}" style="font-size:${fontSize}px">${label}</text><text class="graph-score" y="${scoreY}">${score}</text>${node.is_requirement ? '<text class="graph-target" y="-53">цель</text>' : ""}</g>`;
  }).join("");
  svg.innerHTML = `<defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${edges}${nodes}`;
}

// src/candidate.ts
async function loadCandidateDashboard() {
  const vacancyId = $("#candidate-vacancy", HTMLSelectElement).value || selectedVacancyId();
  const candidate = await api(`/api/v1/candidates/${encodeURIComponent(state.candidateId)}?vacancy_id=${encodeURIComponent(vacancyId)}`);
  $("#profile-summary").innerHTML = `<div class="avatar">${html(initials(candidate.name))}</div><h2>${html(candidate.name)}</h2><p>${html(candidate.desired_role)} · ${html(candidate.city)}<br>${html(candidate.about)}</p><div class="profile-stack">${candidate.stack.map((item) => `<span>${html(item)}</span>`).join("")}</div>`;
  renderGraph(candidate.graph);
  const vacancy = requireVacancy(vacancyId);
  const gaps = candidate.match.gaps.slice(0, 4);
  $("#candidate-match").innerHTML = `<div class="match-big"><strong>${Math.round(candidate.match.score)}</strong><span>/ 100 match</span></div><div class="progress"><i style="width:${candidate.match.score}%"></i></div><div class="gap-list">${gaps.length ? gaps.map((gap) => `<div class="gap-item"><span>${html(skillById(gap.skill_id)?.name)}</span><span>−${percent(gap.deficit)}</span></div>`).join("") : '<p class="quiet">Все требования подтверждены. Можно идти на интервью.</p>'}</div><p class="quiet">${html(vacancy.title)} · ${html(vacancy.employer)}</p>`;
  $("#recommendations").innerHTML = candidate.recommendations.length ? candidate.recommendations.slice(0, 2).map((item) => {
    const competition = competitionById(item.competition_id);
    return `<div class="recommendation"><strong>${html(competition?.name || item.competition_id)}</strong><span>Подтвердит: ${item.closes_skills.map((id) => html(skillById(id)?.name)).join(", ")}</span></div>`;
  }).join("") : '<p class="quiet">Граф цели закрыт. Выберите более сложную вакансию — найдём следующий шаг.</p>';
  $("#evidence-list").innerHTML = candidate.evidence.map((item) => `<div class="evidence-row"><div class="place">#${item.placement}</div><div><strong>${html(item.competition)}</strong><span>${html(item.discipline)} · роль: ${html(item.role)}${item.rank ? ` · разряд ${html(item.rank)}` : ""}</span></div><span class="verified">${item.source === "fsp" ? "ФСП" : html(item.source)}</span></div>`).join("");
  $("#offer-count").textContent = "0";
  $("#offer-list").innerHTML = '<p class="quiet">Это демонстрация кабинета. Реальные приглашения доступны после регистрации.</p>';
}

// src/views.ts
function switchView(view) {
  for (const button of $$(".role-button"))
    button.classList.toggle("active", button.dataset.view === view);
  for (const element of $$(".view"))
    element.classList.toggle("active", element.id === `${view}-view`);
  if (view === "candidate")
    loadCandidateDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showAccountView() {
  for (const button of $$(".role-button"))
    button.classList.remove("active");
  for (const element of $$(".view"))
    element.classList.toggle("active", element.id === "account-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// src/account.ts
function setAuthTab(tab) {
  for (const button of $$("[data-auth-tab]"))
    button.classList.toggle("active", button.dataset.authTab === tab);
  $("#login-form").hidden = tab !== "login";
  $("#register-form").hidden = tab !== "register";
  $("#verify-form").hidden = tab !== "verify";
}
function openAuth(tab = "login", message = "") {
  setAuthTab(tab);
  if (message)
    setStatus($("#login-form", HTMLFormElement), message);
  $("#auth-dialog", HTMLDialogElement).showModal();
}
function updateAuthChrome() {
  $("#open-auth").hidden = Boolean(state.user);
  $("#open-account").hidden = !state.user;
  if (state.user)
    $("#open-account").textContent = state.user.display_name;
}
async function restoreSession() {
  const session = await api("/api/v1/auth/session");
  state.user = session.authenticated ? session.user : null;
  updateAuthChrome();
}
function signedOut() {
  state.user = null;
  state.account = null;
  state.ownedVacancies = [];
  updateAuthChrome();
}
function fillForm(form, values) {
  for (const [key, value] of Object.entries(values)) {
    const control = form.elements.namedItem(key);
    if (control instanceof HTMLInputElement && control.type === "checkbox")
      control.checked = Boolean(value);
    else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      control.value = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    }
  }
}
function commaList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function invitationCard(item, candidateMode) {
  const actions = candidateMode && ["sent", "viewed"].includes(item.status) ? `<div class="inline-actions"><button data-invitation-status="accepted" data-id="${item.id}">Принять</button><button data-invitation-status="rejected" data-id="${item.id}">Отклонить</button></div>` : "";
  return `<div class="record-card"><div><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.position_title)}</strong><p>${html(item.company_name)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div><p>${html(item.description)}</p>${candidateMode ? `<small>Связь: ${html(item.contact_method)}</small>` : `<small>${item.candidate_name ? html(item.candidate_name) : "Кандидат"}${item.candidate_contact ? ` · ${html(item.candidate_contact)}` : " · контакт откроется после принятия"}</small>`}${actions}</div>`;
}
function renderCandidateAccount(invitations, applications) {
  $("#real-invitation-count").textContent = String(invitations.length);
  $("#real-invitations").innerHTML = invitations.length ? invitations.map((item) => invitationCard(item, true)).join("") : '<p class="quiet">Приглашений пока нет. После публикации профиль появится в банке работодателей.</p>';
  $("#real-applications").innerHTML = applications.length ? applications.map((item) => `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.title)}</strong><p>${html(item.employer)} · ${money(item.salary_from)} — ${money(item.salary_to)}</p></div>`).join("") : '<p class="quiet">Вы пока не откликались. Основная механика сервиса — приглашения работодателей.</p>';
  const applied = new Set(applications.map((item) => item.vacancy_id));
  const vacancies = state.vacancies.filter((item) => item.accepts_applications);
  $("#real-vacancies").innerHTML = vacancies.length ? vacancies.map((item) => `<div class="real-vacancy"><div><small>${html(item.employer)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-apply="${html(item.id)}" ${applied.has(item.id) ? "disabled" : ""}>${applied.has(item.id) ? "Отклик отправлен" : "Откликнуться"}</button></div>`).join("") : '<p class="quiet">Опубликованных вакансий зарегистрированных работодателей пока нет.</p>';
  for (const button of $$("[data-invitation-status]")) {
    button.addEventListener("click", async () => {
      const status = dataOf(button, "invitationStatus");
      await api(`/api/v1/invitations/${dataOf(button, "id")}/status`, {
        method: "PATCH",
        body: { status }
      });
      toast(status === "accepted" ? "Приглашение принято — контакт открыт" : "Приглашение отклонено");
      await loadAccountState();
    });
  }
  for (const button of $$("[data-apply]")) {
    button.addEventListener("click", () => {
      const vacancy = requireVacancy(dataOf(button, "apply"));
      field($("#application-form", HTMLFormElement), "vacancy_id", HTMLInputElement).value = vacancy.id;
      $("#application-title").textContent = `Отклик: ${vacancy.title}`;
      $("#application-dialog", HTMLDialogElement).showModal();
    });
  }
}
function renderEmployerAccount(invitations, applications) {
  $("#employer-invitations").innerHTML = invitations.length ? invitations.map((item) => invitationCard(item, false)).join("") : '<p class="quiet">Откройте подборку и пригласите первого зарегистрированного кандидата.</p>';
  $("#employer-applications").innerHTML = applications.length ? applications.map((item) => `<div class="record-card"><span class="record-status ${html(item.status)}">${html(item.status)}</span><strong>${html(item.candidate_name)}</strong><p>${html(item.title)} · ${html(item.candidate_contact)}</p>${["submitted", "viewed"].includes(item.status) ? `<div class="inline-actions"><button data-application-status="accepted" data-id="${item.id}">Принять</button><button data-application-status="rejected" data-id="${item.id}">Отклонить</button></div>` : ""}</div>`).join("") : '<p class="quiet">Входящих откликов пока нет.</p>';
  $("#owned-vacancies").innerHTML = state.ownedVacancies.length ? state.ownedVacancies.map((item) => `<div class="real-vacancy"><div><small>${html(item.grade)} · ${html(formatLabel[item.work_format])}</small><strong>${html(item.title)}</strong><span>${money(item.salary_from)} — ${money(item.salary_to)}</span></div><button class="button button-soft" data-owned-match="${html(item.id)}">Подобрать</button></div>`).join("") : '<p class="quiet">Создайте первую вакансию с обязательной зарплатной вилкой.</p>';
  for (const button of $$("[data-application-status]")) {
    button.addEventListener("click", async () => {
      await api(`/api/v1/applications/${dataOf(button, "id")}/status`, {
        method: "PATCH",
        body: { status: dataOf(button, "applicationStatus") }
      });
      toast("Статус отклика обновлён");
      await loadAccountState();
    });
  }
  for (const button of $$("[data-owned-match]")) {
    button.addEventListener("click", async () => {
      const vacancyId = dataOf(button, "ownedMatch");
      state.vacancyId = vacancyId;
      switchView("employer");
      await selectVacancy(vacancyId);
      $("#workspace").scrollIntoView({ behavior: "smooth" });
    });
  }
}
async function loadAccountState() {
  const { user } = state;
  if (!user)
    return;
  state.account = await api("/api/v1/account/profile");
  $("#account-title").textContent = `Здравствуйте, ${user.display_name}`;
  $("#account-subtitle").textContent = user.role === "candidate" ? "Подтвердите специализацию — и работодатели смогут пригласить вас напрямую." : "Опишите команду, сформируйте граф требований и инициируйте контакт.";
  $("#candidate-account").hidden = user.role !== "candidate";
  $("#employer-account").hidden = user.role !== "employer";
  if (user.role === "candidate") {
    const form = $("#candidate-profile-form", HTMLFormElement);
    const profile = candidateProfile();
    if (profile)
      fillForm(form, profile);
    else
      field(form, "contact_email", HTMLInputElement).value = user.email;
    $("#verified-grade").textContent = profile?.verified_grade || "не пройдено";
    $("#download-profile").hidden = !profile;
    if (profile)
      $("#assessment-grade", HTMLSelectElement).value = profile.claimed_grade;
    const [invitations, applications] = await Promise.all([
      api("/api/v1/invitations"),
      api("/api/v1/applications")
    ]);
    renderCandidateAccount(invitations, applications);
  } else {
    const profile = employerProfile();
    if (profile)
      fillForm($("#employer-profile-form", HTMLFormElement), profile);
    state.ownedVacancies = await api("/api/v1/account/vacancies");
    const [invitations, applications] = await Promise.all([
      api("/api/v1/invitations"),
      api("/api/v1/applications")
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
function bindAccountForms() {
  for (const button of $$("[data-auth-tab]")) {
    button.addEventListener("click", () => setAuthTab(dataOf(button, "authTab")));
  }
  const registerForm = $("#register-form", HTMLFormElement);
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formValues(registerForm);
    try {
      const result = await api("/api/v1/auth/register", { method: "POST", body: payload });
      field($("#verify-form", HTMLFormElement), "email", HTMLInputElement).value = payload.email ?? "";
      $("#verification-note").innerHTML = result.verification_delivery === "demo_outbox" ? `Код подтверждения для тестового стенда: <strong>${html(result.verification_code)}</strong>` : "Мы отправили код на указанный email.";
      setAuthTab("verify");
    } catch (error) {
      setStatus(registerForm, messageOf(error));
    }
  });
  const verifyForm = $("#verify-form", HTMLFormElement);
  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formValues(verifyForm);
    try {
      await api("/api/v1/auth/verify-email", { method: "POST", body: payload });
      const loginForm = $("#login-form", HTMLFormElement);
      field(loginForm, "email", HTMLInputElement).value = payload.email ?? "";
      setAuthTab("login");
      setStatus(loginForm, "Email подтверждён. Теперь войдите.");
    } catch (error) {
      setStatus(verifyForm, messageOf(error));
    }
  });
  const loginForm = $("#login-form", HTMLFormElement);
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/v1/auth/login", { method: "POST", body: formValues(loginForm) });
      state.user = result.user;
      updateAuthChrome();
      $("#auth-dialog", HTMLDialogElement).close();
      toast("Вы вошли в защищённый контур");
      await openAccount();
    } catch (error) {
      setStatus(loginForm, messageOf(error));
    }
  });
  const candidateForm = $("#candidate-profile-form", HTMLFormElement);
  candidateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(candidateForm);
    const payload = {
      ...values,
      years_experience: Number(values.years_experience),
      stack: commaList(values.stack ?? ""),
      roles: commaList(values.roles ?? ""),
      soft_skills: commaList(values.soft_skills ?? ""),
      fsp_id: values.fsp_id || null,
      consent_processing: field(candidateForm, "consent_processing", HTMLInputElement).checked,
      consent_publication: field(candidateForm, "consent_publication", HTMLInputElement).checked,
      profile_visible: field(candidateForm, "profile_visible", HTMLInputElement).checked
    };
    try {
      const saved = await api("/api/v1/account/candidate-profile", {
        method: "PUT",
        body: payload
      });
      state.account = saved;
      $("#assessment-grade", HTMLSelectElement).value = saved.profile.claimed_grade;
      setStatus(candidateForm, "Профиль сохранён");
      toast("Профиль и настройки приватности обновлены");
      state.candidates = await api("/api/v1/candidates");
      await loadAccountState();
    } catch (error) {
      setStatus(candidateForm, messageOf(error));
    }
  });
  $("#connect-fsp").addEventListener("click", async () => {
    try {
      if (!candidateProfile()) {
        toast("Сначала сохраните профиль кандидата");
        return;
      }
      const connection = await api("/api/v1/integrations/fsp/connect/start", { method: "POST" });
      window.location.assign(connection.authorize_url);
    } catch (error) {
      toast(messageOf(error));
    }
  });
  const employerForm = $("#employer-profile-form", HTMLFormElement);
  employerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/v1/account/employer-profile", { method: "PUT", body: formValues(employerForm) });
      setStatus(employerForm, "Компания сохранена");
      toast("Теперь можно создавать вакансии и приглашения");
      await loadAccountState();
    } catch (error) {
      setStatus(employerForm, messageOf(error));
    }
  });
  const assessmentForm = $("#assessment-form", HTMLFormElement);
  $("#start-assessment").addEventListener("click", async () => {
    try {
      const attempt = await api("/api/v1/assessments/start", {
        method: "POST",
        body: { target_grade: $("#assessment-grade", HTMLSelectElement).value }
      });
      state.assessmentId = attempt.id;
      $("#assessment-questions").innerHTML = attempt.questions.map((question, index) => `<fieldset class="question-card"><legend>${index + 1}. ${html(question.prompt)}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${html(question.id)}" value="${optionIndex}" required> ${html(option)}</label>`).join("")}</fieldset>`).join("");
      assessmentForm.hidden = false;
      $("#assessment-result").innerHTML = "";
    } catch (error) {
      toast(messageOf(error));
    }
  });
  assessmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const answers = {};
    for (const [key, value] of new FormData(assessmentForm))
      answers[key] = Number(value);
    try {
      const result = await api(`/api/v1/assessments/${state.assessmentId}/submit`, {
        method: "POST",
        body: { answers }
      });
      $("#assessment-result").innerHTML = `<div class="assessment-outcome ${result.passed ? "passed" : "failed"}"><strong>${result.passed ? "Грейд подтверждён" : "Грейд пока не подтверждён"}</strong><span>${Math.round(result.score * 100)}% · рекомендация: ${html(result.recommended_grade)}</span></div>`;
      assessmentForm.hidden = true;
      state.candidates = await api("/api/v1/candidates");
      await loadAccountState();
    } catch (error) {
      setStatus(assessmentForm, messageOf(error));
    }
  });
  const applicationForm = $("#application-form", HTMLFormElement);
  applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/v1/applications", { method: "POST", body: formValues(applicationForm) });
      setStatus(applicationForm, "Отклик отправлен");
      window.setTimeout(() => $("#application-dialog", HTMLDialogElement).close(), 600);
      await loadAccountState();
    } catch (error) {
      setStatus(applicationForm, messageOf(error));
    }
  });
}

// src/main.ts
async function boot() {
  try {
    [state.catalog, state.vacancies, state.candidates] = await Promise.all([
      api("/api/v1/catalog"),
      api("/api/v1/vacancies"),
      api("/api/v1/candidates")
    ]);
    const [first] = state.vacancies;
    if (!first)
      throw new Error("Нет опубликованных вакансий");
    state.vacancyId = first.id;
    $("#persona-select").innerHTML = state.candidates.map((item) => `<option value="${html(item.id)}">${html(item.name)}</option>`).join("");
    $("#candidate-vacancy").innerHTML = state.vacancies.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join("");
    addRequirement("python", 70, 5);
    addRequirement("algorithms", 60, 4);
    renderCompetitionOptions();
    renderVacancies();
    await selectVacancy(first.id);
    await restoreSession();
    if (new URLSearchParams(window.location.search).get("fsp") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      toast("ФСП ID подключён, результаты соревнований импортированы");
      await openAccount();
    }
  } catch (error) {
    $("#candidate-grid").innerHTML = `<div class="empty-state">${html(messageOf(error))}. Обновите страницу.</div>`;
  }
}
function bindFilter(selector, apply) {
  const select = $(selector, HTMLSelectElement);
  select.addEventListener("change", () => {
    apply(select.value);
    renderCandidates();
  });
}
for (const button of $$(".role-button"))
  button.addEventListener("click", () => switchView(dataOf(button, "view")));
for (const button of $$("[data-close]"))
  button.addEventListener("click", () => button.closest("dialog")?.close());
for (const dialog of $$("dialog", HTMLDialogElement)) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog)
      dialog.close();
  });
}
$("#start-search").addEventListener("click", () => $("#workspace").scrollIntoView({ behavior: "smooth" }));
$("#hero-register").addEventListener("click", () => openAuth("register"));
$("#open-auth").addEventListener("click", () => openAuth("login"));
$("#open-account").addEventListener("click", openAccount);
$("#account-new-vacancy").addEventListener("click", openVacancyEditor);
$("#find-candidates").addEventListener("click", () => switchView("employer"));
$("#back-to-demo").addEventListener("click", () => switchView(state.user?.role === "candidate" ? "candidate" : "employer"));
$("#logout").addEventListener("click", async () => {
  await send("/api/v1/auth/logout", { method: "POST" });
  signedOut();
  switchView("employer");
  toast("Сессия завершена");
});
for (const button of $$("[data-open-data]")) {
  button.addEventListener("click", () => $("#data-dialog", HTMLDialogElement).showModal());
}
var search = $("#candidate-search", HTMLInputElement);
search.addEventListener("input", () => {
  state.search = search.value;
  renderCandidates();
});
bindFilter("#candidate-specialization", (value) => {
  state.specialization = value;
});
bindFilter("#candidate-grade", (value) => {
  state.grade = value;
});
bindFilter("#candidate-fsp", (value) => {
  state.fsp = value;
});
var persona = $("#persona-select", HTMLSelectElement);
persona.addEventListener("change", () => {
  state.candidateId = persona.value;
  loadCandidateDashboard();
});
$("#candidate-vacancy").addEventListener("change", loadCandidateDashboard);
$("#add-requirement").addEventListener("click", () => addRequirement());
$("#draft-vacancy-graph").addEventListener("click", draftVacancyGraph);
var policyMode = $("#vacancy-form [name=policy_mode]", HTMLSelectElement);
policyMode.addEventListener("change", () => {
  $("#competition-policy").hidden = policyMode.value !== "allowlist";
});
bindForms();
bindAccountForms();
boot();
