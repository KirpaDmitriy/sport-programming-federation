import { COMPETITIONS, RUBRIC, SKILLS, TASK, checks, createState, evidenceFor, makeCandidate, makeSkills, nextId, sources } from './data.mjs';

export class ApiError extends Error {
  constructor(status, code, message, details = []) { super(message); this.status = status; this.code = code; this.details = details; }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const found = (value) => value ?? fail(404, 'not_found', 'Ресурс не найден');
const rank = { junior: 1, middle: 2, senior: 3 };
const activeAssessment = new Set(['draft', 'in_progress', 'submitted', 'evaluating']);
const terminalInvitation = new Set(['accepted', 'declined', 'withdrawn']);
const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));
const plusDays = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString();
const me = ({ s, actor }) => found(s.candidates.get(actor.candidateId));
const own = (value, actor, field = 'companyId') => value?.[field] === actor[field] ? value : fail(404, 'not_found', 'Ресурс не найден');
const needFor = ({ s, actor }, id) => own(s.needs.get(id), actor);
const invitationFor = ({ s, actor }, id) => {
  const item = s.invitations.get(id);
  return item && (actor.role === 'candidate' ? item.candidateId === actor.candidateId : item.company.id === actor.companyId) ? item : fail(404, 'not_found', 'Ресурс не найден');
};
const assessmentFor = ({ s, actor }, id) => own(s.assessments.get(id), actor, 'candidateId');
const jobFor = ({ s, actor }, id) => {
  const job = s.jobs.get(id);
  return job?.ownerActorId === actor.id ? job : fail(404, 'not_found', 'Ресурс не найден');
};
const shortlistFor = ({ s, actor }, id) => own(s.shortlists.get(id), actor);
const processing = (candidate) => candidate.consents.processing || fail(403, 'processing_consent_required', 'Для обработки данных необходимо согласие');

function onboarding(candidate) {
  const emailVerified = candidate.emailVerified;
  const questionnaireComplete = Boolean(candidate.name.trim() && candidate.specialization && candidate.selectedGrade && candidate.stack.length && candidate.teamRole.trim() && candidate.experience.trim());
  const assessmentPassed = Boolean(candidate.verifiedGrade && candidate.verifiedSpecialization);
  const blockers = [];
  if (!emailVerified) blockers.push('email');
  if (!questionnaireComplete) blockers.push('questionnaire');
  if (!assessmentPassed) blockers.push('assessment');
  if (!candidate.consents.processing) blockers.push('processing_consent');
  if (!candidate.consents.publication) blockers.push('publication_consent');
  return { emailVerified, questionnaireComplete, assessmentPassed, readyForPublication: emailVerified && questionnaireComplete && assessmentPassed && candidate.consents.processing, visibleToEmployers: blockers.length === 0, blockers };
}
function eligibility(s, candidate) {
  const nextEligibleAt = candidate.gradeConfirmedAt ? plusDays(candidate.gradeConfirmedAt, s.policy.gradeChangeCooldownDays) : null;
  const form = onboarding(candidate);
  const running = [...s.assessments.values()].some((item) => item.candidateId === candidate.id && activeAssessment.has(item.status));
  const reason = !form.emailVerified || !form.questionnaireComplete || !candidate.consents.processing ? 'onboarding_incomplete' : running ? 'active_assessment' : nextEligibleAt && Date.parse(nextEligibleAt) > Date.parse(s.clock) ? 'cooldown' : null;
  const sameGrade = candidate.verifiedGrade === candidate.selectedGrade && candidate.verifiedSpecialization === candidate.specialization;
  const selectedReason = ['onboarding_incomplete', 'active_assessment'].includes(reason) ? reason : candidate.specialization !== 'backend' ? 'unsupported_scope' : candidate.verifiedSpecialization === candidate.specialization && rank[candidate.selectedGrade] < rank[candidate.verifiedGrade] ? 'grade_downgrade' : reason === 'cooldown' && !sameGrade ? 'cooldown' : null;
  return { selectedSpecialization: candidate.specialization, selectedGrade: candidate.selectedGrade, canStartSelected: !selectedReason, selectedReason, canStartUpgrade: !reason, nextEligibleAt, cooldownDays: s.policy.gradeChangeCooldownDays, reason };
}
function profileDto(s, candidate) {
  const form = onboarding(candidate);
  return {
    ...pick(candidate, ['id', 'alias', 'email', 'emailVerified', 'name', 'industry', 'specialization', 'selectedGrade', 'stack', 'teamRole', 'experienceMonths', 'experience', 'softSkills', 'consents', 'verifiedGrade', 'verifiedSpecialization', 'gradeConfirmedAt', 'revision', 'updatedAt']),
    category: { specialization: candidate.verifiedSpecialization, grade: candidate.verifiedGrade, eligible: form.visibleToEmployers },
    onboarding: form, assessmentEligibility: eligibility(s, candidate),
  };
}
function patchProfile(s, candidate, patch) {
  Object.assign(candidate, structuredClone(patch), { revision: candidate.revision + 1, updatedAt: s.clock });
  return profileDto(s, candidate);
}
const publicSkillKeys = ['skillId', 'label', 'status', 'evidenceGrade', 'evidenceSources', 'summary', 'evidenceCount', 'confirmedAt'];
function isVisible(s, candidate) { return s.scenario !== 'empty_bank' && candidate && onboarding(candidate).visibleToEmployers; }
function visibleCandidate(s, id) { const candidate = s.candidates.get(id); return isVisible(s, candidate) ? candidate : fail(404, 'not_found', 'Ресурс не найден'); }
function match(candidate, need) {
  const requirements = need.requirements.map((requirement) => {
    const skill = candidate.skills.find((item) => item.skillId === requirement.skillId);
    const policy = requirement.evidencePolicy;
    const acceptedAssessment = policy.acceptAssessments && skill?.evidenceSources.includes('assessment');
    const supported = skill && skill.status === 'confirmed' && acceptedAssessment && rank[skill.evidenceGrade] >= rank[requirement.minimumGrade];
    const status = supported ? 'meets' : !skill || skill.status === 'insufficient' ? 'not_evidenced' : 'needs_verification';
    const reason = supported ? 'Навык подтверждён проверкой нужного уровня, которую принимает работодатель.' : status === 'not_evidenced' ? 'Пока нет достаточных свидетельств по этому навыку.' : !acceptedAssessment && skill.status === 'confirmed' ? 'Имеющееся подтверждение не соответствует политике этой потребности.' : 'Есть основания, но уровень по этому требованию ещё следует подтвердить.';
    return { skillId: requirement.skillId, criticality: requirement.criticality, status, evidenceStatus: skill?.status ?? 'insufficient', reason };
  });
  const required = requirements.filter((item) => item.criticality === 'required');
  const desired = requirements.filter((item) => item.criticality === 'desired');
  const gradeMatches = candidate.verifiedSpecialization === need.specialization && rank[candidate.verifiedGrade] >= rank[need.grade];
  const requiredMet = required.filter((item) => item.status === 'meets').length;
  const desiredMet = desired.filter((item) => item.status === 'meets').length;
  const status = required.some((item) => item.status === 'not_evidenced') ? 'missing_required' : requiredMet === required.length && gradeMatches ? 'meets_required' : 'needs_verification';
  return { needId: need.id, status, gradeMatches, requiredMet, requiredTotal: required.length, desiredMet, desiredTotal: desired.length, requirements, explanation: gradeMatches ? `Подтверждено обязательных требований: ${requiredMet} из ${required.length}.` : 'Подтверждённая специализация или грейд пока не соответствуют потребности.', algorithmVersion: 'fixture-rules-v1' };
}
function anonymous(candidate, need = null) {
  return {
    id: candidate.id, alias: candidate.alias, specialization: candidate.verifiedSpecialization,
    verifiedGrade: candidate.verifiedGrade, gradeConfirmedAt: candidate.gradeConfirmedAt,
    workModes: [...candidate.workModes], availableForOffers: true,
    skills: candidate.skills.map((skill) => pick(skill, publicSkillKeys)),
    sourceKinds: [...new Set([...candidate.skills.flatMap((skill) => skill.evidenceSources), ...(candidate.sources.some((source) => source.provider === 'fsp' && source.verifiedParticipation) ? ['fsp'] : [])])],
    fspVerified: candidate.sources.some((source) => source.provider === 'fsp' && source.verifiedParticipation),
    match: need ? match(candidate, need) : null, simulation: true,
  };
}
function graph(candidate, audience) {
  const nodes = [{ id: 'role-main', kind: 'role', label: ({ backend: 'Бэкенд', frontend: 'Фронтенд', fullstack: 'Фулстек' })[candidate.verifiedSpecialization ?? candidate.specialization], skillId: null, status: null }];
  const edges = [];
  for (const skill of candidate.skills) {
    const id = `skill-${skill.skillId}`;
    nodes.push({ id, kind: 'skill', label: skill.label, skillId: skill.skillId, status: skill.status });
    edges.push({ id: `edge-role-${skill.skillId}`, from: 'role-main', to: id, relation: 'uses' });
    if (audience === 'self') for (const evidence of skill.evidence) {
      nodes.push({ id: evidence.id, kind: 'evidence', label: evidence.title, skillId: null, status: null });
      edges.push({ id: `edge-${evidence.id}`, from: evidence.id, to: id, relation: 'supports' });
    }
  }
  return { audience, nodes, edges, simulation: true };
}
function gapPlan(candidate, need) {
  const result = match(candidate, need);
  return {
    candidateId: candidate.id, needId: need.id, simulation: true,
    items: result.requirements.filter((item) => item.status !== 'meets').map((item) => {
      const policy = need.requirements.find((requirement) => requirement.skillId === item.skillId).evidencePolicy;
      const acceptedCompetitionIds = policy.acceptFsp ? COMPETITIONS.filter((competition) => competition.skillIds.includes(item.skillId) && (policy.competitionSelection === 'system' || policy.competitionIds.includes(competition.id))).map((competition) => competition.id) : [];
      return { skillId: item.skillId, status: item.status, reason: item.reason, action: policy.acceptAssessments ? 'Пройдите практическую проверку навыка нужного уровня.' : 'Предоставьте свидетельство из источников, которые принимает работодатель.', acceptedCompetitionIds, assessmentAvailable: policy.acceptAssessments && need.specialization === 'backend' };
    }),
  };
}
function companyDto(company) { return { ...company, readyToInvite: Boolean(company.businessArea.trim() && company.description.trim() && company.contactEmail && company.displayName.trim()) }; }
function validateNeed(need) {
  if (need.salary.from > need.salary.to) fail(422, 'salary_range_invalid', 'Минимальная зарплата не может превышать максимальную');
  if (new Set(need.requirements.map((item) => item.skillId)).size !== need.requirements.length) fail(422, 'duplicate_skill', 'Навык нельзя повторять в требованиях');
  if (!need.requirements.some((item) => item.criticality === 'required')) fail(422, 'required_skill_missing', 'Укажите хотя бы одно обязательное требование');
  for (const requirement of need.requirements) {
    const policy = requirement.evidencePolicy;
    if (![policy.acceptAssessments, policy.acceptGithub, policy.acceptFsp].some(Boolean)) fail(422, 'empty_evidence_policy', 'Выберите хотя бы один источник свидетельств');
    if (policy.competitionIds.some((id) => !COMPETITIONS.some((competition) => competition.id === id))) fail(422, 'unknown_competition', 'Неизвестное соревнование');
    if (policy.competitionSelection === 'system' && policy.competitionIds.length) fail(422, 'ambiguous_competition_policy', 'При системном выборе список соревнований должен быть пуст');
    if (policy.acceptFsp && policy.competitionSelection === 'selected' && !policy.competitionIds.length) fail(422, 'competition_required', 'Укажите принимаемые соревнования');
  }
}
function shortlistDto(s, item, detail = true) {
  return { ...pick(item, ['id', 'title', 'createdAt', 'updatedAt']), count: item.memberIds.length, ...(detail ? { members: item.memberIds.map((id) => ({ candidateId: id, alias: s.candidates.get(id)?.alias ?? 'Недоступный профиль', available: Boolean(isVisible(s, s.candidates.get(id))) })) } : {}) };
}
const invitationDto = (item) => pick(item, ['id', 'candidateId', 'candidateAlias', 'company', 'need', 'message', 'status', 'createdAt', 'viewedAt', 'respondedAt', 'disclosureFields']);
const assessmentDto = (item) => pick(item, ['id', 'specialization', 'grade', 'status', 'task', 'answer', 'checks', 'result', 'createdAt', 'updatedAt', 'revision', 'simulation']);
const jobDto = (item) => pick(item, ['id', 'kind', 'status', 'createdAt', 'updatedAt', 'result', 'error', 'pollAfterMs', 'simulation']);
const sessionDto = (s, actor) => ({ actorId: actor.id, role: actor.role, emailVerified: actor.role === 'candidate' ? s.candidates.get(actor.candidateId).emailVerified : actor.emailVerified, candidateId: actor.candidateId, companyId: actor.companyId, displayName: actor.role === 'candidate' ? s.candidates.get(actor.candidateId).name : s.companies.get(actor.companyId).displayName });
function mutableAssessment(item) { if (!['draft', 'in_progress'].includes(item.status)) fail(409, 'assessment_not_editable', 'Проверка уже отправлена или завершена'); }
function createJob(s, actor, kind, work, extra = {}) {
  const job = { id: nextId(s, 'job'), ownerActorId: actor.id, candidateId: actor.candidateId, kind, status: 'queued', createdAt: s.clock, updatedAt: s.clock, result: null, error: null, pollAfterMs: 250, simulation: true, work, ...extra };
  s.jobs.set(job.id, job);
  for (const [delay, phase] of [[300, 'running'], [1000, 'complete']]) {
    const timer = setTimeout(() => { s.timers.delete(timer); advanceJob(s, job, phase); }, delay);
    timer.unref(); s.timers.add(timer);
  }
  return jobDto(job);
}
function startSourceSync(ctx, candidate, source) {
  if (source.activeJobId) {
    const running = ctx.s.jobs.get(source.activeJobId);
    if (running && !['succeeded', 'failed'].includes(running.status)) return jobDto(running);
  }
  const job = createJob(ctx.s, ctx.actor, 'source_sync', () => {
    for (const repo of source.repositories) if (repo.status === 'queued') repo.status = 'processed';
    source.counts = { found: source.repositories.length, processed: source.repositories.filter((repo) => repo.status === 'processed').length, queued: 0, unavailable: source.repositories.filter((repo) => repo.status === 'unavailable').length };
    source.lastSyncedAt = ctx.s.clock; source.activeJobId = null;
    if (source.provider === 'github' && !candidate.skills.length) candidate.skills = makeSkills(candidate.id).map((skill) => skill.status === 'confirmed' ? { ...skill, status: 'evidence', evidenceGrade: null, confirmedAt: null, evidenceSources: ['github'], summary: 'Есть свидетельства использования; уровень не проверен', evidence: evidenceFor(candidate.id, skill.skillId, 'evidence') } : skill);
    candidate.updatedAt = ctx.s.clock;
    return { kind: 'source_sync', source: structuredClone(source) };
  }, { sourceId: source.id });
  source.activeJobId = job.id;
  return job;
}
function completeAssessment(s, candidate, item) {
  const outcome = s.scenario === 'service_failure' ? 'service_error' : s.scenario === 'assessment_failure' ? 'failed' : 'passed';
  const previousGrade = candidate.verifiedGrade;
  const gradeChanged = outcome === 'passed' && (candidate.verifiedGrade !== item.grade || candidate.verifiedSpecialization !== item.specialization);
  if (outcome === 'passed') {
    if (candidate.verifiedSpecialization !== item.specialization || !candidate.verifiedGrade || rank[item.grade] >= rank[candidate.verifiedGrade]) {
      candidate.verifiedGrade = item.grade; candidate.verifiedSpecialization = item.specialization;
      if (gradeChanged) candidate.gradeConfirmedAt = s.clock;
      for (const skillId of ['rust', 'postgresql']) {
        const previous = candidate.skills.find((skill) => skill.skillId === skillId);
        const current = makeSkills(candidate.id, true).find((skill) => skill.skillId === skillId);
        const assessmentEvidence = { ...evidenceFor(candidate.id, skillId, 'confirmed')[0], id: `evidence-${item.id}-${skillId}`, reference: item.id, observedAt: s.clock };
        const evidence = [...(previous?.evidence ?? []), assessmentEvidence];
        const updated = { ...current, evidenceGrade: item.grade, confirmedAt: s.clock, evidence, evidenceCount: evidence.length, evidenceSources: [...new Set(evidence.map((entry) => entry.source))] };
        const index = candidate.skills.findIndex((skill) => skill.skillId === skillId);
        if (index < 0) candidate.skills.push(updated); else candidate.skills[index] = updated;
      }
      candidate.revision += 1; candidate.updatedAt = s.clock;
    }
  }
  const outcomes = outcome === 'service_error' ? [] : RUBRIC.map((criterion, index) => ({ criterionId: criterion.id, label: criterion.label, outcome: outcome === 'passed' ? 'met' : index === 0 ? 'partial' : 'not_met', feedback: outcome === 'passed' ? 'Критерий выполнен в демонстрационном сценарии.' : outcome === 'service_error' ? 'Оценка не получена из-за ошибки сервиса.' : 'Критерий требует доработки в демонстрационном сценарии.' }));
  item.status = outcome; item.checks = outcome === 'service_error' ? [] : checks(outcome === 'passed' ? 'pass' : 'fail'); item.updatedAt = s.clock; item.revision += 1;
  item.result = { assessmentId: item.id, outcome, confirmedGrade: candidate.verifiedGrade, previousGrade, gradeChanged, rubric: outcomes, checks: item.checks, feedback: outcome === 'passed' ? 'Проверка пройдена. Результат симулирован для демонстрации интерфейса.' : outcome === 'failed' ? 'Требования пока не выполнены. Ранее подтверждённый грейд сохранён.' : 'Ошибка демонстрационного оценивания. Грейд сохранён, штрафа и дополнительного ожидания нет.', nextEligibleAt: candidate.gradeConfirmedAt ? plusDays(candidate.gradeConfirmedAt, s.policy.gradeChangeCooldownDays) : null, simulation: true };
  return { kind: 'assessment', assessment: assessmentDto(item) };
}
function advanceJob(s, job, phase) {
  if (['succeeded', 'failed'].includes(job.status)) return;
  const candidate = s.candidates.get(job.candidateId);
  if (candidate && !candidate.consents.processing) {
    job.status = 'failed'; job.error = { code: 'processing_consent_revoked', message: 'Согласие на обработку отозвано', retryable: true }; job.pollAfterMs = 0;
    if (job.sourceId) { const source = candidate.sources.find((item) => item.id === job.sourceId); if (source) source.activeJobId = null; }
    if (job.kind === 'assessment') { const item = s.assessments.get(job.assessmentId); item.status = 'service_error'; item.updatedAt = s.clock; }
    return;
  }
  if (phase === 'running') {
    job.status = 'running';
    if (job.kind === 'assessment') s.assessments.get(job.assessmentId).status = 'evaluating';
  } else if (job.kind === 'checks' && s.assessments.get(job.assessmentId).revision !== job.inputRevision) {
    job.status = 'failed'; job.error = { code: 'stale_input', message: 'Решение изменилось после запуска проверок. Запустите проверки повторно.', retryable: true };
  } else {
    try {
      job.result = job.work();
      job.status = job.kind === 'assessment' && job.result.assessment.status === 'service_error' ? 'failed' : 'succeeded';
      if (job.status === 'failed') job.error = { code: 'assessment_service_unavailable', message: 'Симулированная ошибка оценивания', retryable: true };
    } catch {
      job.status = 'failed'; job.error = { code: 'fixture_job_failed', message: 'Ошибка демонстрационного задания', retryable: true };
    }
  }
  if (['succeeded', 'failed'].includes(job.status)) job.pollAfterMs = 0;
  job.updatedAt = s.clock;
}

const handlers = {
  getHealth: () => ({ status: 'ok', service: 'fsp-mock-api', version: '0.1.0' }),
  getMeta: ({ s }) => ({ contractVersion: '0.1.0', mode: 'mock', serverTime: s.clock, scenario: s.scenario, capabilities: { emailVerification: true, profilePdf: true, githubFixture: true, fspFixture: true, matching: true, directInvitations: true, vacancyPublication: false, selfApplication: false, chat: false, recurringTasks: false, realCodeExecution: false, realLlm: false }, assessmentPolicy: { successfulGradeChangeCooldownDays: s.policy.gradeChangeCooldownDays, failedAttemptCooldownDays: 0, serviceFailureCooldownDays: 0, sameGradeRetryCooldownDays: 0, aiAllowed: true, externalAiAllowed: true, supportedScopes: [{ specialization: 'backend', grades: ['junior', 'middle', 'senior'] }] }, competitions: COMPETITIONS, skills: SKILLS }),
  createEmailChallenge: ({ s, body }) => {
    const existing = [...s.actors.values()].find((item) => item.email === body.email.toLowerCase());
    if (existing && existing.role !== body.role) fail(409, 'role_mismatch', 'Роль существующего аккаунта изменить нельзя');
    const item = { id: nextId(s, 'challenge'), role: body.role, email: body.email.toLowerCase(), code: '123456', expiresAt: new Date(Date.parse(s.clock) + 900000).toISOString(), used: false, attempts: 0 };
    s.challenges.set(item.id, item); return { challengeId: item.id, expiresAt: item.expiresAt, delivery: 'mock_mailbox' };
  },
  verifyEmail: ({ s, body }) => {
    const challenge = found(s.challenges.get(body.challengeId));
    if (Date.parse(challenge.expiresAt) <= Date.parse(s.clock)) fail(400, 'challenge_expired', 'Срок действия кода истёк');
    if (challenge.used) fail(409, 'challenge_used', 'Код уже использован');
    if (challenge.attempts >= 5) fail(429, 'challenge_locked', 'Создайте новый запрос подтверждения');
    challenge.attempts += 1;
    if (challenge.code !== body.code) fail(400, 'invalid_code', 'Неверный код');
    let actor = [...s.actors.values()].find((item) => item.email === challenge.email);
    if (!actor) {
      if (challenge.role === 'candidate') {
        const id = nextId(s, 'candidate');
        const candidate = makeCandidate(id, { name: 'Новый участник', email: challenge.email, fresh: true });
        candidate.alias = `Кандидат №${id.slice(-3)}`; s.candidates.set(id, candidate);
        actor = { id, role: 'candidate', candidateId: id, companyId: null, email: challenge.email };
      } else {
        const companyId = nextId(s, 'company'); const id = nextId(s, 'employer');
        s.companies.set(companyId, { id: companyId, displayName: '', businessArea: '', description: '', contactEmail: challenge.email, website: null });
        actor = { id, role: 'employer', candidateId: null, companyId, email: challenge.email, emailVerified: true };
      }
      s.actors.set(actor.id, actor);
    } else if (actor.role !== challenge.role) fail(409, 'role_mismatch', 'Роль существующего аккаунта изменить нельзя');
    challenge.used = true;
    if (actor.role === 'candidate') s.candidates.get(actor.candidateId).emailVerified = true;
    else actor.emailVerified = true;
    return sessionDto(s, actor);
  },
  logout: () => null,
  getSession: ({ s, actor }) => sessionDto(s, actor),
  mockSelectSession: ({ s, body }) => sessionDto(s, found(s.actors.get(body.actor))),
  mockReset: ({ domain, body }) => { domain.reset(body.scenario); return { scenario: body.scenario, clock: domain.state.clock }; },
  mockAdvanceClock: ({ s, body }) => { s.clock = new Date(Date.parse(s.clock) + body.advanceSeconds * 1000).toISOString(); return { clock: s.clock }; },
  mockEmailCodes: ({ s }) => ({ items: [...s.challenges.values()].map((item) => ({ challengeId: item.id, ...pick(item, ['email', 'code', 'expiresAt', 'used']) })) }),
  getMyProfile: (ctx) => profileDto(ctx.s, me(ctx)),
  updateMyProfile: (ctx) => patchProfile(ctx.s, me(ctx), ctx.body),
  importMyProfile: (ctx) => {
    const candidate = me(ctx); processing(candidate);
    return createJob(ctx.s, ctx.actor, 'profile_import', () => ({ kind: 'profile_import', preview: { name: 'Алексей Морозов', specialization: 'backend', selectedGrade: 'middle', stack: ['rust', 'postgresql', 'docker'], teamRole: 'Разработчик', experienceMonths: null, experience: 'Демонстрационное извлечение: API на Rust и PostgreSQL. Содержимое загруженного файла не анализировалось.', softSkills: ['Командная работа'] }, parser: 'fixture_preview', simulation: true }));
  },
  confirmProfileImport: (ctx) => {
    const job = jobFor(ctx, ctx.params.jobId);
    if (job.kind !== 'profile_import') fail(404, 'not_found', 'Импорт не найден');
    if (job.status !== 'succeeded') fail(409, 'import_not_ready', 'Дождитесь завершения импорта');
    if (job.confirmed) fail(409, 'import_already_confirmed', 'Импорт уже применён');
    const candidate = me(ctx); processing(candidate); job.confirmed = true;
    return patchProfile(ctx.s, candidate, ctx.body.profile);
  },
  exportMyProfile: (ctx) => ({ pdfProfile: profileDto(ctx.s, me(ctx)) }),
  getMySources: (ctx) => ({ items: me(ctx).sources, simulation: true }),
  connectMySource: (ctx) => {
    const candidate = me(ctx); processing(candidate);
    const index = candidate.sources.findIndex((item) => item.provider === ctx.params.provider);
    if (index < 0) fail(404, 'not_found', 'Источник не найден');
    if (ctx.params.provider === 'github') candidate.sources[index] = sources(candidate.id)[0];
    else candidate.sources[index] = sources(candidate.id, { fspLinked: true, fspVerified: ctx.body.account === 'FSP-DEMO-024' || ctx.body.account === 'FSP-DEMO-031' })[1];
    candidate.sources[index].accountLabel = ctx.body.account;
    startSourceSync(ctx, candidate, candidate.sources[index]);
    candidate.updatedAt = ctx.s.clock;
    return candidate.sources[index];
  },
  syncMySource: (ctx) => {
    const candidate = me(ctx); processing(candidate);
    const source = found(candidate.sources.find((item) => item.id === ctx.params.sourceId));
    if (source.status !== 'connected') fail(409, 'source_not_connected', 'Сначала подключите источник');
    return startSourceSync(ctx, candidate, source);
  },
  getMySkills: (ctx) => ({ items: me(ctx).skills, simulation: true }),
  getMyGraph: (ctx) => graph(me(ctx), 'self'),
  getMyGapPlan: (ctx) => {
    const invitation = [...ctx.s.invitations.values()].find((item) => item.candidateId === ctx.actor.candidateId && item.need.id === ctx.query.needId);
    if (!invitation) fail(404, 'not_found', 'Потребность недоступна этому кандидату');
    return gapPlan(me(ctx), invitation.needDefinition);
  },
  listMyAssessments: (ctx) => ({ items: [...ctx.s.assessments.values()].filter((item) => item.candidateId === ctx.actor.candidateId).sort((a, b) => b.id.localeCompare(a.id)).map(assessmentDto) }),
  startAssessment: (ctx) => {
    const candidate = me(ctx); processing(candidate); const form = onboarding(candidate);
    if (!form.emailVerified || !form.questionnaireComplete) fail(409, 'onboarding_incomplete', 'Подтвердите почту и заполните анкету');
    if (ctx.body.specialization !== 'backend') fail(422, 'assessment_scope_unavailable', 'Демонстрационные задания доступны только для бэкенда');
    if ([...ctx.s.assessments.values()].some((item) => item.candidateId === candidate.id && activeAssessment.has(item.status))) fail(409, 'assessment_active', 'Сначала завершите текущую проверку');
    if (candidate.verifiedSpecialization === ctx.body.specialization && rank[ctx.body.grade] < rank[candidate.verifiedGrade]) fail(422, 'grade_downgrade_forbidden', 'Проверка не должна понижать подтверждённый грейд');
    const changing = candidate.verifiedGrade && (candidate.verifiedGrade !== ctx.body.grade || candidate.verifiedSpecialization !== ctx.body.specialization);
    if (changing && candidate.gradeConfirmedAt && Date.parse(plusDays(candidate.gradeConfirmedAt, ctx.s.policy.gradeChangeCooldownDays)) > Date.parse(ctx.s.clock)) fail(409, 'grade_change_cooldown', 'Изменить грейд можно после nextEligibleAt в профиле');
    const item = { id: nextId(ctx.s, 'assessment'), candidateId: candidate.id, specialization: ctx.body.specialization, grade: ctx.body.grade, status: 'draft', task: { ...structuredClone(TASK), variantId: `orders-${ctx.body.grade}-a` }, answer: { code: TASK.starterCode, explanation: '', externalAiUsed: false }, checks: checks(), result: null, createdAt: ctx.s.clock, updatedAt: ctx.s.clock, revision: 1, simulation: true };
    ctx.s.assessments.set(item.id, item); return assessmentDto(item);
  },
  getAssessment: (ctx) => assessmentDto(assessmentFor(ctx, ctx.params.assessmentId)),
  saveAssessmentAnswer: (ctx) => {
    const item = assessmentFor(ctx, ctx.params.assessmentId); processing(me(ctx)); mutableAssessment(item);
    item.answer = ctx.body; item.status = 'in_progress'; item.revision += 1; item.updatedAt = ctx.s.clock;
    return assessmentDto(item);
  },
  runAssessmentChecks: (ctx) => {
    const item = assessmentFor(ctx, ctx.params.assessmentId); processing(me(ctx)); mutableAssessment(item);
    return createJob(ctx.s, ctx.actor, 'checks', () => { item.checks = checks(ctx.s.scenario === 'assessment_failure' ? 'fail' : 'pass'); return { kind: 'checks', assessmentId: item.id, checks: item.checks, simulation: true }; }, { assessmentId: item.id, inputRevision: item.revision });
  },
  askAssessmentAssistant: (ctx) => {
    const item = assessmentFor(ctx, ctx.params.assessmentId); processing(me(ctx)); mutableAssessment(item);
    return { message: 'Демонстрационный ответ: зафиксируйте ключ идемпотентности и создание заказа в одной транзакции. Добавьте уникальное ограничение, определите поведение конкурентных запросов и объясните повтор после ошибки. Ответ подготовлен заранее; модель не вызывалась.', simulation: true, aiAllowed: true, externalAiAllowed: true };
  },
  submitAssessment: (ctx) => {
    const candidate = me(ctx); processing(candidate); const item = assessmentFor(ctx, ctx.params.assessmentId); mutableAssessment(item);
    if (!item.answer.code.trim() || !item.answer.explanation.trim()) fail(422, 'answer_incomplete', 'Сохраните решение и его объяснение');
    item.status = 'submitted'; item.updatedAt = ctx.s.clock; item.revision += 1;
    return createJob(ctx.s, ctx.actor, 'assessment', () => completeAssessment(ctx.s, candidate, item), { assessmentId: item.id });
  },
  getJob: (ctx) => jobDto(jobFor(ctx, ctx.params.jobId)),
  listMyInvitations: (ctx) => ({ items: [...ctx.s.invitations.values()].filter((item) => item.candidateId === ctx.actor.candidateId).map(invitationDto) }),
  getMyInvitation: (ctx) => invitationDto(invitationFor(ctx, ctx.params.invitationId)),
  viewMyInvitation: (ctx) => {
    const item = invitationFor(ctx, ctx.params.invitationId);
    if (item.status === 'sent') { item.status = 'viewed'; item.viewedAt = ctx.s.clock; }
    return invitationDto(item);
  },
  acceptMyInvitation: (ctx) => {
    const item = invitationFor(ctx, ctx.params.invitationId); const candidate = me(ctx);
    const disclose = [...ctx.body.disclose].sort();
    if (item.status === 'accepted' && JSON.stringify([...item.disclosureFields].sort()) === JSON.stringify(disclose)) return invitationDto(item);
    if (terminalInvitation.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    if (!candidate.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту');
    item.status = 'accepted'; item.respondedAt = ctx.s.clock; item.disclosureFields = disclose;
    const disclosed = {};
    if (disclose.includes('name')) disclosed.name = candidate.name;
    if (disclose.includes('email')) disclosed.email = candidate.email;
    if (disclose.includes('sourceLinks')) disclosed.sourceLinks = [...new Set(candidate.sources.flatMap((source) => source.repositories.map((repo) => repo.url)))];
    ctx.s.disclosures.set(`${item.company.id}:${candidate.id}`, { candidateId: candidate.id, companyId: item.company.id, granted: true, invitationId: item.id, grantedAt: ctx.s.clock, fields: disclosed });
    return invitationDto(item);
  },
  declineMyInvitation: (ctx) => {
    const item = invitationFor(ctx, ctx.params.invitationId);
    if (item.status === 'declined') return invitationDto(item);
    if (terminalInvitation.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    item.status = 'declined'; item.respondedAt = ctx.s.clock; return invitationDto(item);
  },
  getCompany: ({ s, actor }) => companyDto(found(s.companies.get(actor.companyId))),
  updateCompany: ({ s, actor, body }) => { const company = found(s.companies.get(actor.companyId)); Object.assign(company, body); return companyDto(company); },
  listNeeds: ({ s, actor }) => ({ items: [...s.needs.values()].filter((item) => item.companyId === actor.companyId) }),
  createNeed: (ctx) => {
    validateNeed(ctx.body); const item = { ...structuredClone(ctx.body), id: nextId(ctx.s, 'need'), companyId: ctx.actor.companyId, published: false, createdAt: ctx.s.clock, updatedAt: ctx.s.clock, revision: 1 };
    ctx.s.needs.set(item.id, item); return item;
  },
  getNeed: (ctx) => needFor(ctx, ctx.params.needId),
  updateNeed: (ctx) => {
    const item = needFor(ctx, ctx.params.needId); const proposed = { ...item, ...ctx.body }; validateNeed(proposed);
    Object.assign(item, structuredClone(ctx.body), { updatedAt: ctx.s.clock, revision: item.revision + 1 }); return item;
  },
  deleteNeed: (ctx) => { const item = needFor(ctx, ctx.params.needId); ctx.s.needs.delete(item.id); return null; },
  getNeedGraph: (ctx) => {
    const need = needFor(ctx, ctx.params.needId); const nodes = [{ id: 'need-root', kind: 'role', label: need.title, skillId: null, status: null }]; const edges = [];
    for (const requirement of need.requirements) { const id = `skill-${requirement.skillId}`; nodes.push({ id, kind: 'skill', label: SKILLS.find((skill) => skill.id === requirement.skillId).label, skillId: requirement.skillId, status: null }); edges.push({ id: `requires-${requirement.skillId}`, from: 'need-root', to: id, relation: 'requires' }); }
    return { audience: 'employer', nodes, edges, simulation: true };
  },
  searchCandidates: (ctx) => {
    if (ctx.s.scenario === 'api_error') fail(503, 'fixture_search_unavailable', 'Демонстрационная ошибка поиска. Повторите запрос.');
    const need = ctx.query.needId ? needFor(ctx, ctx.query.needId) : null;
    if (ctx.query.mode === 'recommended' && !need) fail(422, 'need_required', 'Для рекомендаций выберите потребность');
    let items = [...ctx.s.candidates.values()].filter((candidate) => isVisible(ctx.s, candidate));
    if (ctx.query.mode === 'recommended') items = items.filter((candidate) => candidate.verifiedSpecialization === need.specialization && rank[candidate.verifiedGrade] >= rank[need.grade]);
    if (ctx.query.specialization) items = items.filter((candidate) => candidate.verifiedSpecialization === ctx.query.specialization);
    if (ctx.query.grade) items = items.filter((candidate) => candidate.verifiedGrade === ctx.query.grade);
    if (ctx.query.skill) items = items.filter((candidate) => candidate.skills.some((skill) => skill.skillId === ctx.query.skill && skill.status !== 'insufficient'));
    if (ctx.query.fsp === 'verified') items = items.filter((candidate) => candidate.sources.some((source) => source.provider === 'fsp' && source.verifiedParticipation));
    let result = items.map((candidate) => anonymous(candidate, need));
    result.sort((a, b) => need ? Number(b.match.gradeMatches) - Number(a.match.gradeMatches) || b.match.requiredMet - a.match.requiredMet || b.match.desiredMet - a.match.desiredMet || Number(b.fspVerified) - Number(a.fspVerified) || a.id.localeCompare(b.id) : a.specialization.localeCompare(b.specialization) || rank[b.verifiedGrade] - rank[a.verifiedGrade] || Number(b.fspVerified) - Number(a.fspVerified) || a.id.localeCompare(b.id));
    const page = ctx.query.page ?? 1; const pageSize = ctx.query.pageSize ?? 10; const total = result.length;
    result = result.slice((page - 1) * pageSize, page * pageSize);
    return { items: result, page, pageSize, total, hasNextPage: page * pageSize < total };
  },
  getCandidate: (ctx) => anonymous(visibleCandidate(ctx.s, ctx.params.candidateId), ctx.query.needId ? needFor(ctx, ctx.query.needId) : null),
  getCandidateGraph: (ctx) => graph(visibleCandidate(ctx.s, ctx.params.candidateId), 'employer'),
  getCandidateGapPlan: (ctx) => gapPlan(visibleCandidate(ctx.s, ctx.params.candidateId), needFor(ctx, ctx.query.needId)),
  getCandidateDisclosure: (ctx) => {
    const grant = ctx.s.disclosures.get(`${ctx.actor.companyId}:${ctx.params.candidateId}`);
    if (grant) return grant;
    visibleCandidate(ctx.s, ctx.params.candidateId);
    return { candidateId: ctx.params.candidateId, companyId: ctx.actor.companyId, granted: false, invitationId: null, grantedAt: null, fields: {} };
  },
  listShortlists: (ctx) => ({ items: [...ctx.s.shortlists.values()].filter((item) => item.companyId === ctx.actor.companyId).map((item) => shortlistDto(ctx.s, item, false)) }),
  createShortlist: (ctx) => {
    const item = { id: nextId(ctx.s, 'shortlist'), companyId: ctx.actor.companyId, title: ctx.body.title, memberIds: [], createdAt: ctx.s.clock, updatedAt: ctx.s.clock }; ctx.s.shortlists.set(item.id, item); return shortlistDto(ctx.s, item);
  },
  getShortlist: (ctx) => shortlistDto(ctx.s, shortlistFor(ctx, ctx.params.shortlistId)),
  updateShortlist: (ctx) => { const item = shortlistFor(ctx, ctx.params.shortlistId); item.title = ctx.body.title; item.updatedAt = ctx.s.clock; return shortlistDto(ctx.s, item); },
  deleteShortlist: (ctx) => { const item = shortlistFor(ctx, ctx.params.shortlistId); ctx.s.shortlists.delete(item.id); return null; },
  addShortlistMember: (ctx) => {
    const item = shortlistFor(ctx, ctx.params.shortlistId); visibleCandidate(ctx.s, ctx.params.candidateId);
    if (!item.memberIds.includes(ctx.params.candidateId)) item.memberIds.push(ctx.params.candidateId);
    item.updatedAt = ctx.s.clock; return shortlistDto(ctx.s, item);
  },
  removeShortlistMember: (ctx) => { const item = shortlistFor(ctx, ctx.params.shortlistId); item.memberIds = item.memberIds.filter((id) => id !== ctx.params.candidateId); item.updatedAt = ctx.s.clock; return shortlistDto(ctx.s, item); },
  listInvitations: (ctx) => ({ items: [...ctx.s.invitations.values()].filter((item) => item.company.id === ctx.actor.companyId).map(invitationDto) }),
  createInvitation: (ctx) => {
    const company = companyDto(found(ctx.s.companies.get(ctx.actor.companyId)));
    if (!company.readyToInvite) fail(422, 'company_incomplete', 'Заполните описание компании со сферой деятельности и контактную почту');
    if (!ctx.actor.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту работодателя');
    const need = needFor(ctx, ctx.body.needId); validateNeed(need); const candidate = visibleCandidate(ctx.s, ctx.body.candidateId);
    if ([...ctx.s.invitations.values()].some((item) => item.company.id === company.id && item.candidateId === candidate.id && item.need.id === need.id && ['sent', 'viewed', 'accepted'].includes(item.status))) fail(409, 'invitation_exists', 'Приглашение по этой потребности уже существует');
    const item = { id: nextId(ctx.s, 'invitation'), candidateId: candidate.id, candidateAlias: candidate.alias, company: pick(company, ['id', 'displayName', 'businessArea', 'description', 'contactEmail']), need: pick(need, ['id', 'title', 'workMode', 'salary', 'description']), needDefinition: structuredClone(need), message: ctx.body.message, status: 'sent', createdAt: ctx.s.clock, viewedAt: null, respondedAt: null, disclosureFields: [] };
    item.need = structuredClone(item.need); ctx.s.invitations.set(item.id, item); return invitationDto(item);
  },
  getInvitation: (ctx) => invitationDto(invitationFor(ctx, ctx.params.invitationId)),
  withdrawInvitation: (ctx) => {
    const item = invitationFor(ctx, ctx.params.invitationId); if (item.status === 'withdrawn') return invitationDto(item);
    if (terminalInvitation.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    item.status = 'withdrawn'; item.respondedAt = ctx.s.clock; return invitationDto(item);
  },
};

export class MockDomain {
  constructor({ scenario = 'baseline', gradeChangeCooldownDays = 90 } = {}) {
    if (!Number.isInteger(gradeChangeCooldownDays) || gradeChangeCooldownDays < 0 || gradeChangeCooldownDays > 365) throw new Error('Invalid gradeChangeCooldownDays');
    this.policy = { gradeChangeCooldownDays }; this.reset(scenario);
  }
  reset(scenario = 'baseline') {
    this.close(); this.state = createState(scenario); this.state.policy = { ...this.policy };
    for (const item of this.state.assessments.values()) if (item.result) item.result.nextEligibleAt = plusDays(item.updatedAt, this.policy.gradeChangeCooldownDays);
    const actor = this.state.actors.get('candidate024'); const candidate = this.state.candidates.get(actor.candidateId);
    for (const source of candidate.sources) if (source.status === 'connected' && source.counts.queued) startSourceSync({ s: this.state, actor }, candidate, source);
  }
  close() { for (const timer of this.state?.timers ?? []) clearTimeout(timer); this.state?.timers.clear(); }
  handle(operationId, context) {
    const handler = handlers[operationId];
    if (!handler) throw new Error(`Missing handler: ${operationId}`);
    return handler({ domain: this, s: this.state, ...context });
  }
}
export const handledOperations = Object.keys(handlers);
