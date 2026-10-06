import { api } from './api.ts';
import { $ } from './dom.ts';
import { html, initials, percent } from './format.ts';
import { renderGraph } from './graph.ts';
import { competitionById, requireVacancy, selectedVacancyId, skillById, state } from './state.ts';
import type { CandidateDetailForVacancy } from './types.ts';

export async function loadCandidateDashboard(): Promise<void> {
  const vacancyId = $('#candidate-vacancy', HTMLSelectElement).value || selectedVacancyId();
  const candidate = await api<CandidateDetailForVacancy>(
    `/api/v1/candidates/${encodeURIComponent(state.candidateId)}?vacancy_id=${encodeURIComponent(vacancyId)}`,
  );
  $('#profile-summary').innerHTML =
    `<div class="avatar">${html(initials(candidate.name))}</div><h2>${html(candidate.name)}</h2><p>${html(candidate.desired_role)} · ${html(candidate.city)}<br>${html(candidate.about)}</p><div class="profile-stack">${candidate.stack.map((item) => `<span>${html(item)}</span>`).join('')}</div>`;
  renderGraph(candidate.graph);
  const vacancy = requireVacancy(vacancyId);
  const gaps = candidate.match.gaps.slice(0, 4);
  $('#candidate-match').innerHTML =
    `<div class="match-big"><strong>${Math.round(candidate.match.score)}</strong><span>/ 100 match</span></div><div class="progress"><i style="width:${candidate.match.score}%"></i></div><div class="gap-list">${gaps.length ? gaps.map((gap) => `<div class="gap-item"><span>${html(skillById(gap.skill_id)?.name)}</span><span>−${percent(gap.deficit)}</span></div>`).join('') : '<p class="quiet">Все требования подтверждены. Можно идти на интервью.</p>'}</div><p class="quiet">${html(vacancy.title)} · ${html(vacancy.employer)}</p>`;
  $('#recommendations').innerHTML = candidate.recommendations.length
    ? candidate.recommendations
        .slice(0, 2)
        .map((item) => {
          const competition = competitionById(item.competition_id);
          return `<div class="recommendation"><strong>${html(competition?.name || item.competition_id)}</strong><span>Подтвердит: ${item.closes_skills.map((id) => html(skillById(id)?.name)).join(', ')}</span></div>`;
        })
        .join('')
    : '<p class="quiet">Граф цели закрыт. Выберите более сложную вакансию — найдём следующий шаг.</p>';
  $('#evidence-list').innerHTML = candidate.evidence
    .map(
      (item) =>
        `<div class="evidence-row"><div class="place">#${item.placement}</div><div><strong>${html(item.competition)}</strong><span>${html(item.discipline)} · роль: ${html(item.role)}${item.rank ? ` · разряд ${html(item.rank)}` : ''}</span></div><span class="verified">${item.source === 'fsp' ? 'ФСП' : html(item.source)}</span></div>`,
    )
    .join('');
  // The candidate detail carries no offers: real invitations live in the account view.
  $('#offer-count').textContent = '0';
  $('#offer-list').innerHTML =
    '<p class="quiet">Это демонстрация кабинета. Реальные приглашения доступны после регистрации.</p>';
}
