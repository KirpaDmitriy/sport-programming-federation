const state = {
  catalog: { skills: [], competitions: [] },
  vacancies: [],
  candidates: [],
  matches: [],
  vacancyId: null,
  category: "Все",
  search: "",
  candidateId: "alina",
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
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось выполнить запрос");
  }
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
  const categories = ["Все", ...new Set(state.candidates.flatMap((item) => item.profile.categories))];
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
    const categoryMatch = state.category === "Все" || item.match.profile.categories.includes(state.category);
    const haystack = [item.name, item.city, item.desired_role, ...item.stack].join(" ").toLocaleLowerCase("ru");
    return categoryMatch && (!query || haystack.includes(query));
  });
  if (!matches.length) {
    $("#candidate-grid").innerHTML = '<div class="empty-state">В этом контуре пока никого. Снимите фильтр или выберите другую вакансию.</div>';
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
      <div class="detail-actions"><button class="button button-dark" data-offer="${html(candidate.id)}">Сделать предложение · ${money(vacancyById(state.vacancyId).salary_from)}+</button></div>
    </div>`;
  $("#candidate-dialog").showModal();
  $('[data-offer]').addEventListener("click", () => openOffer(id));
}

function openOffer(candidateId) {
  $("#candidate-dialog").close();
  const form = $("#offer-form");
  form.candidate_id.value = candidateId;
  form.vacancy_id.innerHTML = state.vacancies.map((item) => `<option value="${html(item.id)}" ${item.id === state.vacancyId ? "selected" : ""}>${html(item.title)}</option>`).join("");
  const vacancy = vacancyById(state.vacancyId);
  form.salary_from.value = vacancy.salary_from;
  form.salary_to.value = vacancy.salary_to;
  $(".form-status", form).textContent = "";
  $("#offer-dialog").showModal();
}

function switchView(view) {
  $$('.role-button').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$('.view').forEach((element) => element.classList.toggle("active", element.id === `${view}-view`));
  if (view === "candidate") loadCandidateDashboard();
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
  $("#evidence-list").innerHTML = candidate.evidence.map((item) => `<div class="evidence-row"><div class="place">#${item.placement}</div><div><strong>${html(item.competition)}</strong><span>${html(item.discipline)} · роль: ${html(item.role)}${item.rank ? ` · разряд ${html(item.rank)}` : ""}</span></div><span class="verified">${item.official ? "ФСП ✓" : html(item.source)}</span></div>`).join("");
  $("#offer-count").textContent = candidate.offers.length;
  $("#offer-list").innerHTML = candidate.offers.length ? candidate.offers.map((item) => `<div class="offer-item"><strong>${html(item.title)}</strong><span>${html(item.employer)} · ${money(item.salary_from)} — ${money(item.salary_to)}</span></div>`).join("") : '<p class="quiet">Новых предложений пока нет. Профиль уже виден работодателям.</p>';
}

function bindForms() {
  $("#offer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.salary_from = Number(data.salary_from);
    data.salary_to = Number(data.salary_to);
    try {
      await api("/api/v1/offers", { method: "POST", body: JSON.stringify(data) });
      $(".form-status", form).textContent = "Предложение отправлено";
      window.setTimeout(() => $("#offer-dialog").close(), 700);
      toast("Предложение появилось у кандидата");
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
      state.vacancies.push(created);
      state.vacancyId = created.id;
      renderVacancies();
      await selectVacancy(created.id);
      $(".form-status", form).textContent = "Вакансия создана";
      window.setTimeout(() => $("#vacancy-dialog").close(), 600);
      toast("Граф требований готов — подбор пересчитан");
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
  } catch (error) {
    $("#candidate-grid").innerHTML = `<div class="empty-state">${html(error.message)}. Обновите страницу.</div>`;
  }
}

$$('.role-button').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$$('[data-close]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$$('dialog').forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
$("#start-search").addEventListener("click", () => $("#workspace").scrollIntoView({ behavior: "smooth" }));
$("#open-vacancy").addEventListener("click", () => $("#vacancy-dialog").showModal());
$("#open-data").addEventListener("click", () => $("#data-dialog").showModal());
$("#candidate-search").addEventListener("input", (event) => { state.search = event.target.value; renderCandidates(); });
$("#persona-select").addEventListener("change", (event) => { state.candidateId = event.target.value; loadCandidateDashboard(); });
$("#candidate-vacancy").addEventListener("change", loadCandidateDashboard);
$("#add-requirement").addEventListener("click", () => addRequirement());
$("#vacancy-form [name=policy_mode]").addEventListener("change", (event) => {
  $("#competition-policy").hidden = event.target.value !== "allowlist";
});
bindForms();
boot();
