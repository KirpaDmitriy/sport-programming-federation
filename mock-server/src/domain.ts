import type { OperationId, Route } from './contract.ts';
import {
  type Actor,
  type ApplicationRecord,
  type AssessmentRecord,
  type Candidate,
  COMPETITIONS,
  type Company,
  createState,
  evidenceFor,
  type Grade,
  type InvitationRecord,
  type JobRecord,
  type JobResult,
  makeCandidate,
  makeSkills,
  type Need,
  nextId,
  type Scenario,
  SKILLS,
  type Source,
  type State,
  sources,
  type TaskRecord,
  type TaskResponse,
} from './data.ts';
import { fspResults } from './fsp-fixture.ts';
import type { components } from './generated/schema.d.ts';
import { knowledgeCompletion, knowledgeTask, scoreKnowledge, validKnowledgeAnswer } from './knowledge.ts';

type Schemas = components['schemas'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Schemas['Error']['details'];

  constructor(status: number, code: string, message: string, details: Schemas['Error']['details'] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};
const challengeAttempts = (s: State, email: string) =>
  [...s.challenges.values()]
    .filter((item) => item.email === email && !item.used && Date.parse(item.expiresAt) > Date.parse(s.clock))
    .reduce((sum, item) => sum + item.attempts, 0);
const found = <T>(value: T | null | undefined): T => value ?? fail(404, 'not_found', 'Ресурс не найден');
/** For states the seed data and the rules make impossible; reaching one is a mock defect. */
const must = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`Inconsistent mock state: ${what}`);
  return value;
};
const rank: Record<Grade, number> = { junior: 1, middle: 2, senior: 3 };
// A missing grade compares as NaN, so every comparison with it is false.
const rankOf = (grade: Grade | null | undefined) => (grade ? rank[grade] : Number.NaN);
const activeAssessment = new Set<AssessmentRecord['status']>(['draft', 'in_progress', 'submitted', 'evaluating']);
const terminalStatus = new Set<InvitationRecord['status']>(['accepted', 'declined', 'withdrawn']);
const pick = <T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
const plusDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString();
/** A verified grade or a counted task answer keeps a profile fresh for this many days. */
const FRESHNESS_DAYS = 90;
const WEEK_MS = 7 * 86400000;
const EPOCH_MONDAY = Date.parse('1970-01-05T00:00:00.000Z');
/** Tasks are offered per ISO week (Monday 00:00 UTC) of the server clock. */
function taskPeriod(clock: string) {
  const index = Math.floor((Date.parse(clock) - EPOCH_MONDAY) / WEEK_MS);
  const from = EPOCH_MONDAY + index * WEEK_MS;
  return { index, from: new Date(from).toISOString(), to: new Date(from + WEEK_MS).toISOString() };
}

type Query = Readonly<Record<string, string | number | undefined>>;
interface Context<Body = unknown, CurrentActor = Actor | null> {
  domain: MockDomain;
  s: State;
  actor: CurrentActor;
  body: Body;
  params: Readonly<Record<string, string>>;
  query: Query;
}
type Ctx = Context<unknown, Actor>;

const param = (ctx: { params: Readonly<Record<string, string>> }, name: string) =>
  must(ctx.params[name], `path parameter ${name}`);
const queryText = (query: Query, name: string) => {
  const value = query[name];
  return typeof value === 'string' ? value : undefined;
};

const me = ({ s, actor }: Ctx) => found(actor.candidateId ? s.candidates.get(actor.candidateId) : undefined);
function own<K extends 'companyId' | 'candidateId', T extends Record<K, string | null>>(
  value: T | undefined,
  actor: Actor,
  field: K,
): T {
  return value && value[field] === actor[field] ? value : fail(404, 'not_found', 'Ресурс не найден');
}
const needFor = ({ s, actor }: Ctx, id: string) => own(s.needs.get(id), actor, 'companyId');
const invitationFor = ({ s, actor }: Ctx, id: string): InvitationRecord => {
  const item = s.invitations.get(id);
  return item &&
    (actor.role === 'candidate' ? item.candidateId === actor.candidateId : item.company.id === actor.companyId)
    ? item
    : fail(404, 'not_found', 'Ресурс не найден');
};
const applicationFor = ({ s, actor }: Ctx, id: string): ApplicationRecord => {
  const item = s.applications.get(id);
  return item &&
    (actor.role === 'candidate' ? item.candidateId === actor.candidateId : item.company.id === actor.companyId)
    ? item
    : fail(404, 'not_found', 'Ресурс не найден');
};
const assessmentFor = ({ s, actor }: Ctx, id: string) => own(s.assessments.get(id), actor, 'candidateId');
const jobFor = ({ s, actor }: Ctx, id: string): JobRecord => {
  const job = s.jobs.get(id);
  return job?.ownerActorId === actor.id ? job : fail(404, 'not_found', 'Ресурс не найден');
};
const shortlistFor = ({ s, actor }: Ctx, id: string) => own(s.shortlists.get(id), actor, 'companyId');
const processing = (candidate: Candidate) =>
  candidate.consents.processing || fail(403, 'processing_consent_required', 'Для обработки данных необходимо согласие');

function onboarding(candidate: Candidate): Schemas['Onboarding'] {
  const emailVerified = candidate.emailVerified;
  const questionnaireComplete = Boolean(
    candidate.name.trim() &&
      candidate.specialization &&
      candidate.selectedGrade &&
      candidate.stack.length &&
      candidate.teamRole.trim() &&
      candidate.experience.trim(),
  );
  const assessmentPassed = Boolean(candidate.verifiedGrade && candidate.verifiedSpecialization);
  const blockers: Schemas['Onboarding']['blockers'] = [];
  if (!emailVerified) blockers.push('email');
  if (!questionnaireComplete) blockers.push('questionnaire');
  if (!assessmentPassed) blockers.push('assessment');
  if (!candidate.consents.processing) blockers.push('processing_consent');
  if (!candidate.consents.publication) blockers.push('publication_consent');
  return {
    emailVerified,
    questionnaireComplete,
    assessmentPassed,
    readyForPublication: emailVerified && questionnaireComplete && assessmentPassed && candidate.consents.processing,
    visibleToEmployers: blockers.length === 0,
    blockers,
  };
}
function eligibility(s: State, candidate: Candidate): Schemas['GradeEligibility'] {
  const nextEligibleAt = candidate.gradeConfirmedAt
    ? plusDays(candidate.gradeConfirmedAt, s.policy.gradeChangeCooldownDays)
    : null;
  const form = onboarding(candidate);
  const running = [...s.assessments.values()].some(
    (item) =>
      item.candidateId === candidate.id && activeAssessment.has(item.status) && item.task.execution === 'questionnaire',
  );
  const reason =
    !form.emailVerified || !form.questionnaireComplete || !candidate.consents.processing
      ? 'onboarding_incomplete'
      : running
        ? 'active_assessment'
        : nextEligibleAt && Date.parse(nextEligibleAt) > Date.parse(s.clock)
          ? 'cooldown'
          : null;
  const sameGrade =
    candidate.verifiedGrade === candidate.selectedGrade &&
    candidate.verifiedSpecialization === candidate.specialization;
  const selectedReason =
    reason === 'onboarding_incomplete' || reason === 'active_assessment'
      ? reason
      : candidate.specialization !== 'backend'
        ? 'unsupported_scope'
        : candidate.verifiedSpecialization === candidate.specialization &&
            rankOf(candidate.selectedGrade) < rankOf(candidate.verifiedGrade)
          ? 'grade_downgrade'
          : reason === 'cooldown' && !sameGrade
            ? 'cooldown'
            : null;
  return {
    selectedSpecialization: candidate.specialization,
    selectedGrade: candidate.selectedGrade,
    canStartSelected: !selectedReason,
    selectedReason,
    canStartUpgrade: !reason,
    nextEligibleAt,
    cooldownDays: s.policy.gradeChangeCooldownDays,
    reason,
  };
}
const profileKeys = [
  'id',
  'alias',
  'email',
  'emailVerified',
  'name',
  'industry',
  'specialization',
  'selectedGrade',
  'stack',
  'teamRole',
  'experienceMonths',
  'experience',
  'softSkills',
  'consents',
  'verifiedGrade',
  'verifiedSpecialization',
  'gradeConfirmedAt',
  'revision',
  'updatedAt',
] as const;
/** The latest verified grade or task answer the company did not mark as needing work. */
function freshness(s: State, candidate: Candidate): Schemas['Freshness'] {
  const signals: { at: string; kind: 'assessment' | 'task' }[] = [];
  if (candidate.gradeConfirmedAt) signals.push({ at: candidate.gradeConfirmedAt, kind: 'assessment' });
  for (const attempt of s.assessments.values()) {
    if (
      attempt.candidateId === candidate.id &&
      attempt.status === 'passed' &&
      attempt.task.execution === 'questionnaire'
    )
      signals.push({ at: attempt.updatedAt, kind: 'assessment' });
  }
  for (const item of s.taskResponses.values())
    if (item.candidateId === candidate.id && item.status !== 'needs_work')
      signals.push({ at: item.submittedAt, kind: 'task' });
  const latest = signals.sort((a, b) => b.at.localeCompare(a.at))[0];
  return {
    lastSignalAt: latest?.at ?? null,
    lastSignal: latest?.kind ?? null,
    fresh: Boolean(latest && Date.parse(s.clock) - Date.parse(latest.at) <= FRESHNESS_DAYS * 86400000),
    windowDays: FRESHNESS_DAYS,
  };
}
function profileDto(s: State, candidate: Candidate): Schemas['Profile'] {
  const form = onboarding(candidate);
  return {
    ...pick(candidate, profileKeys),
    category: {
      specialization: candidate.verifiedSpecialization,
      grade: candidate.verifiedGrade,
      eligible: form.visibleToEmployers,
    },
    freshness: freshness(s, candidate),
    onboarding: form,
    assessmentEligibility: eligibility(s, candidate),
  };
}
function patchProfile(s: State, candidate: Candidate, patch: Schemas['ProfilePatch']): Schemas['Profile'] {
  Object.assign(candidate, structuredClone(patch), { revision: candidate.revision + 1, updatedAt: s.clock });
  return profileDto(s, candidate);
}
const publicSkillKeys = [
  'skillId',
  'label',
  'status',
  'evidenceGrade',
  'evidenceSources',
  'summary',
  'evidenceCount',
  'confirmedAt',
] as const;
function isVisible(s: State, candidate: Candidate | undefined): candidate is Candidate {
  return s.scenario !== 'empty_bank' && candidate !== undefined && onboarding(candidate).visibleToEmployers;
}
function visibleCandidate(s: State, id: string): Candidate {
  const candidate = s.candidates.get(id);
  return isVisible(s, candidate) ? candidate : fail(404, 'not_found', 'Ресурс не найден');
}
/** A company also sees the anonymous profile of a candidate who applied to it, even outside the public bank. */
function candidateForCompany(s: State, actor: Actor, id: string): Candidate {
  const candidate = s.candidates.get(id);
  const applied = [...s.applications.values()].some(
    (item) => item.candidateId === id && item.company.id === actor.companyId && item.status !== 'withdrawn',
  );
  return candidate && (applied || isVisible(s, candidate)) ? candidate : fail(404, 'not_found', 'Ресурс не найден');
}
function match(candidate: Candidate, need: Need): Schemas['Match'] {
  const requirements = need.requirements.map((requirement): Schemas['MatchRequirement'] => {
    const skill = candidate.skills.find((item) => item.skillId === requirement.skillId);
    const policy = requirement.evidencePolicy;
    const acceptedAssessment = policy.acceptAssessments && skill?.evidenceSources.includes('assessment');
    const supported =
      skill &&
      skill.status === 'confirmed' &&
      acceptedAssessment &&
      rankOf(skill.evidenceGrade) >= rankOf(requirement.minimumGrade);
    const status = supported
      ? 'meets'
      : !skill || skill.status === 'insufficient'
        ? 'not_evidenced'
        : 'needs_verification';
    const reason = supported
      ? 'Навык подтверждён проверкой нужного уровня, которую принимает работодатель.'
      : status === 'not_evidenced'
        ? 'Пока нет достаточных свидетельств по этому навыку.'
        : !acceptedAssessment && skill?.status === 'confirmed'
          ? 'Имеющееся подтверждение не соответствует политике этой потребности.'
          : 'Есть основания, но уровень по этому требованию ещё следует подтвердить.';
    return {
      skillId: requirement.skillId,
      criticality: requirement.criticality,
      status,
      evidenceStatus: skill?.status ?? 'insufficient',
      reason,
    };
  });
  const required = requirements.filter((item) => item.criticality === 'required');
  const desired = requirements.filter((item) => item.criticality === 'desired');
  const gradeMatches =
    candidate.verifiedSpecialization === need.specialization && rankOf(candidate.verifiedGrade) >= rankOf(need.grade);
  const requiredMet = required.filter((item) => item.status === 'meets').length;
  const desiredMet = desired.filter((item) => item.status === 'meets').length;
  const status = required.some((item) => item.status === 'not_evidenced')
    ? 'missing_required'
    : requiredMet === required.length && gradeMatches
      ? 'meets_required'
      : 'needs_verification';
  return {
    needId: need.id,
    status,
    gradeMatches,
    requiredMet,
    requiredTotal: required.length,
    desiredMet,
    desiredTotal: desired.length,
    requirements,
    explanation: gradeMatches
      ? `Подтверждено обязательных требований: ${requiredMet} из ${required.length}.`
      : 'Подтверждённая специализация или грейд пока не соответствуют потребности.',
    algorithmVersion: 'fixture-rules-v1',
  };
}
const fspVerified = (candidate: Candidate) =>
  candidate.sources.some((source) => source.provider === 'fsp' && source.verifiedParticipation);
function anonymous(s: State, candidate: Candidate, need: Need | null = null): Schemas['AnonymousCandidate'] {
  return {
    id: candidate.id,
    alias: candidate.alias,
    specialization: must(candidate.verifiedSpecialization, 'visible candidate without specialization'),
    verifiedGrade: must(candidate.verifiedGrade, 'visible candidate without grade'),
    gradeConfirmedAt: must(candidate.gradeConfirmedAt, 'visible candidate without confirmation date'),
    workModes: [...candidate.workModes],
    availableForOffers: true,
    skills: candidate.skills.map((skill) => pick(skill, publicSkillKeys)),
    sourceKinds: [
      ...new Set([
        ...candidate.skills.flatMap((skill) => skill.evidenceSources),
        ...(fspVerified(candidate) ? ['fsp' as const] : []),
      ]),
    ],
    fspVerified: fspVerified(candidate),
    freshness: freshness(s, candidate),
    match: need ? match(candidate, need) : null,
    simulation: true,
  };
}
const roleLabels = { backend: 'Бэкенд', frontend: 'Фронтенд', fullstack: 'Фулстек' } as const;
function graph(candidate: Candidate, audience: Schemas['Graph']['audience']): Schemas['Graph'] {
  const nodes: Schemas['GraphNode'][] = [
    {
      id: 'role-main',
      kind: 'role',
      label: roleLabels[candidate.verifiedSpecialization ?? candidate.specialization],
      skillId: null,
      status: null,
    },
  ];
  const edges: Schemas['GraphEdge'][] = [];
  for (const skill of candidate.skills) {
    const id = `skill-${skill.skillId}`;
    nodes.push({ id, kind: 'skill', label: skill.label, skillId: skill.skillId, status: skill.status });
    edges.push({ id: `edge-role-${skill.skillId}`, from: 'role-main', to: id, relation: 'uses' });
    if (audience === 'self')
      for (const evidence of skill.evidence) {
        nodes.push({ id: evidence.id, kind: 'evidence', label: evidence.title, skillId: null, status: null });
        edges.push({ id: `edge-${evidence.id}`, from: evidence.id, to: id, relation: 'supports' });
      }
  }
  return { audience, nodes, edges, simulation: true };
}
function gapPlan(candidate: Candidate, need: Need): Schemas['GapPlan'] {
  const result = match(candidate, need);
  return {
    candidateId: candidate.id,
    needId: need.id,
    simulation: true,
    items: result.requirements.flatMap((item) => {
      if (item.status === 'meets') return [];
      const policy = must(
        need.requirements.find((requirement) => requirement.skillId === item.skillId),
        'gap without requirement',
      ).evidencePolicy;
      const acceptedCompetitionIds = policy.acceptFsp
        ? COMPETITIONS.filter(
            (competition) =>
              competition.skillIds.includes(item.skillId) &&
              (policy.competitionSelection === 'system' || policy.competitionIds.includes(competition.id)),
          ).map((competition) => competition.id)
        : [];
      return [
        {
          skillId: item.skillId,
          status: item.status,
          reason: item.reason,
          action: policy.acceptAssessments
            ? 'Пройдите тест знаний нужного уровня.'
            : 'Предоставьте свидетельство из источников, которые принимает работодатель.',
          acceptedCompetitionIds,
          assessmentAvailable: policy.acceptAssessments && need.specialization === 'backend',
        },
      ];
    }),
  };
}
function companyDto(company: Company): Schemas['Company'] {
  return {
    ...company,
    readyToInvite: Boolean(
      company.businessArea.trim() && company.description.trim() && company.contactEmail && company.displayName.trim(),
    ),
  };
}
function validateNeed(need: Pick<Need, 'salary' | 'requirements'>) {
  if (need.salary.from > need.salary.to)
    fail(422, 'salary_range_invalid', 'Минимальная зарплата не может превышать максимальную');
  if (new Set(need.requirements.map((item) => item.skillId)).size !== need.requirements.length)
    fail(422, 'duplicate_skill', 'Навык нельзя повторять в требованиях');
  if (!need.requirements.some((item) => item.criticality === 'required'))
    fail(422, 'required_skill_missing', 'Укажите хотя бы одно обязательное требование');
  for (const requirement of need.requirements) {
    const policy = requirement.evidencePolicy;
    if (![policy.acceptAssessments, policy.acceptGithub, policy.acceptFsp].some(Boolean))
      fail(422, 'empty_evidence_policy', 'Выберите хотя бы один источник свидетельств');
    if (policy.competitionIds.some((id) => !COMPETITIONS.some((competition) => competition.id === id)))
      fail(422, 'unknown_competition', 'Неизвестное соревнование');
    if (policy.competitionSelection === 'system' && policy.competitionIds.length)
      fail(422, 'ambiguous_competition_policy', 'При системном выборе список соревнований должен быть пуст');
    if (policy.acceptFsp && policy.competitionSelection === 'selected' && !policy.competitionIds.length)
      fail(422, 'competition_required', 'Укажите принимаемые соревнования');
  }
}
type ShortlistRecord = State['shortlists'] extends Map<string, infer T> ? T : never;
const shortlistSummary = (item: ShortlistRecord): Schemas['ShortlistSummary'] => ({
  ...pick(item, ['id', 'title', 'createdAt', 'updatedAt']),
  count: item.memberIds.length,
});
const shortlistDetail = (s: State, item: ShortlistRecord): Schemas['Shortlist'] => ({
  ...shortlistSummary(item),
  members: item.memberIds.map((id) => ({
    candidateId: id,
    alias: s.candidates.get(id)?.alias ?? 'Недоступный профиль',
    available: isVisible(s, s.candidates.get(id)),
  })),
});
const invitationKeys = [
  'id',
  'candidateId',
  'candidateAlias',
  'company',
  'need',
  'message',
  'status',
  'createdAt',
  'viewedAt',
  'respondedAt',
  'disclosureFields',
] as const;
const invitationDto = (item: InvitationRecord): Schemas['Invitation'] => pick(item, invitationKeys);
const applicationKeys = [
  'id',
  'candidateId',
  'candidateAlias',
  'company',
  'vacancy',
  'message',
  'status',
  'createdAt',
  'viewedAt',
  'respondedAt',
  'disclosureFields',
] as const;
function applicationDto(s: State, item: ApplicationRecord): Schemas['Application'] {
  const candidate = must(s.candidates.get(item.candidateId), 'application candidate');
  return { ...pick(item, applicationKeys), match: match(candidate, item.needDefinition) };
}
/** Newest first; records created at the same mock instant keep their creation order through the ID. */
const newestFirst = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
const activeApplication = (s: State, candidateId: string, needId: string) =>
  [...s.applications.values()]
    .filter((item) => item.candidateId === candidateId && item.vacancy.id === needId && item.status !== 'withdrawn')
    .sort(newestFirst)[0];
const eligibilityMessage = {
  email: 'Подтвердите почту, чтобы откликаться на вакансии',
  questionnaire: 'Заполните анкету, чтобы откликаться на вакансии',
  assessment: 'Подтвердите грейд тестом знаний, чтобы откликаться на вакансии',
  processing_consent: 'Для отклика необходимо согласие на обработку данных',
  application_exists: 'Вы уже откликнулись на эту вакансию',
} as const satisfies Record<NonNullable<Schemas['ApplicationEligibility']['reason']>, string>;
function applicationEligibility(s: State, candidate: Candidate, need: Need): Schemas['ApplicationEligibility'] {
  const form = onboarding(candidate);
  const reason = !form.emailVerified
    ? 'email'
    : !form.questionnaireComplete
      ? 'questionnaire'
      : !form.assessmentPassed
        ? 'assessment'
        : !candidate.consents.processing
          ? 'processing_consent'
          : activeApplication(s, candidate.id, need.id)
            ? 'application_exists'
            : null;
  return { canApply: reason === null, reason };
}
function publishedNeed(s: State, id: string): Need {
  const need = s.needs.get(id);
  return need?.published ? need : fail(404, 'not_found', 'Вакансия не найдена или снята с публикации');
}
function vacancyDto(s: State, need: Need, candidate: Candidate): Schemas['Vacancy'] {
  const company = companyDto(must(s.companies.get(need.companyId), 'vacancy company'));
  const qualified = onboarding(candidate).assessmentPassed && candidate.consents.processing;
  return {
    id: need.id,
    company: pick(company, ['id', 'displayName', 'businessArea', 'description', 'contactEmail']),
    ...structuredClone(pick(need, ['title', 'specialization', 'grade', 'workMode', 'salary', 'description'])),
    requirements: need.requirements.map((item) => pick(item, ['skillId', 'criticality', 'minimumGrade'])),
    publishedAt: must(need.publishedAt, 'published vacancy without publication date'),
    updatedAt: need.updatedAt,
    match: qualified ? match(candidate, need) : null,
    applicationId: activeApplication(s, candidate.id, need.id)?.id ?? null,
    eligibility: applicationEligibility(s, candidate, need),
  };
}
function offeredTask(s: State, task: TaskRecord): Schemas['OfferedTask'] {
  const company = must(s.companies.get(task.companyId), 'task company');
  return {
    id: task.id,
    company: { id: company.id, displayName: company.displayName },
    ...pick(task, ['title', 'prompt', 'skillId', 'grade', 'estimateMinutes']),
  };
}
const responsesOf = (s: State, candidateId: string) =>
  [...s.taskResponses.values()]
    .filter((item) => item.candidateId === candidateId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
type TaskOffer = {
  current: Schemas['OfferedTask'] | null;
  currentResponse: TaskResponse | null;
  reason: Schemas['MyTasks']['reason'];
};
/**
 * One task per week: active tasks of any company on a skill the candidate has evidence for, at or below the verified
 * grade, not answered in an earlier week, rotated by the week number. An answer given this week stays the week's task.
 */
function taskOffer(s: State, candidate: Candidate): TaskOffer {
  const { index, from } = taskPeriod(s.clock);
  const responses = responsesOf(s, candidate.id);
  const answeredNow = responses.find((item) => item.submittedAt >= from);
  if (answeredNow) return { current: answeredNow.task, currentResponse: answeredNow, reason: null };
  if (!onboarding(candidate).assessmentPassed) return { current: null, currentResponse: null, reason: 'assessment' };
  if (!candidate.consents.processing) return { current: null, currentResponse: null, reason: 'processing_consent' };
  const evidenced = new Set(
    candidate.skills.filter((skill) => skill.status !== 'insufficient').map((skill) => skill.skillId),
  );
  const answered = new Set(responses.map((item) => item.task.id));
  const pool = [...s.tasks.values()]
    .filter(
      (task) =>
        task.status === 'active' &&
        evidenced.has(task.skillId) &&
        rankOf(task.grade) <= rankOf(candidate.verifiedGrade) &&
        !answered.has(task.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const task = pool[index % Math.max(pool.length, 1)];
  return task
    ? { current: offeredTask(s, task), currentResponse: null, reason: null }
    : { current: null, currentResponse: null, reason: 'no_tasks' };
}
const taskKeys = ['id', 'title', 'prompt', 'skillId', 'grade', 'estimateMinutes', 'status', 'createdAt'] as const;
const taskDto = (s: State, task: TaskRecord): Schemas['Task'] => ({
  ...pick(task, taskKeys),
  responseCount: [...s.taskResponses.values()].filter((item) => item.task.id === task.id).length,
});
const taskFor = ({ s, actor }: Ctx, id: string) => own(s.tasks.get(id), actor, 'companyId');
const taskResponseFor = ({ s, actor }: Ctx, id: string): TaskResponse => {
  const item = s.taskResponses.get(id);
  return item?.task.company.id === actor.companyId ? item : fail(404, 'not_found', 'Ресурс не найден');
};
const latestBy = <T>(items: T[], time: (item: T) => string): T | undefined =>
  [...items].sort((a, b) => time(b).localeCompare(time(a)))[0];
/**
 * Recomputes what a company may see of a candidate from every grant: accepted invitations and applications the
 * candidate has not withdrawn. Withdrawing the only grant removes access.
 */
function refreshDisclosure(s: State, companyId: string, candidate: Candidate) {
  const key = `${companyId}:${candidate.id}`;
  const invitations = [...s.invitations.values()].filter(
    (item) => item.company.id === companyId && item.candidateId === candidate.id && item.status === 'accepted',
  );
  const applications = [...s.applications.values()].filter(
    (item) => item.company.id === companyId && item.candidateId === candidate.id && item.status !== 'withdrawn',
  );
  const granted = new Set([...invitations, ...applications].flatMap((item) => item.disclosureFields));
  if (granted.size === 0) {
    s.disclosures.delete(key);
    return;
  }
  const invitation = latestBy(invitations, (item) => item.respondedAt ?? item.createdAt);
  const application = latestBy(applications, (item) => item.createdAt);
  const fields: Schemas['Disclosure']['fields'] = {};
  if (granted.has('name')) fields.name = candidate.name;
  if (granted.has('email')) fields.email = candidate.email;
  if (granted.has('sourceLinks'))
    fields.sourceLinks = [
      ...new Set(candidate.sources.flatMap((source) => source.repositories.map((repo) => repo.url))),
    ];
  const grantedAt = [invitation?.respondedAt, application?.createdAt]
    .filter((value) => value != null)
    .sort()
    .at(-1);
  s.disclosures.set(key, {
    candidateId: candidate.id,
    companyId,
    granted: true,
    invitationId: invitation?.id ?? null,
    applicationId: application?.id ?? null,
    grantedAt: grantedAt ?? null,
    fields,
  });
}
const assessmentKeys = [
  'id',
  'specialization',
  'grade',
  'status',
  'task',
  'answer',
  'checks',
  'result',
  'createdAt',
  'updatedAt',
  'revision',
  'simulation',
] as const;
const assessmentDto = (item: AssessmentRecord): Schemas['Assessment'] => pick(item, assessmentKeys);
const jobKeys = [
  'id',
  'kind',
  'status',
  'createdAt',
  'updatedAt',
  'result',
  'error',
  'pollAfterMs',
  'simulation',
] as const;
const jobDto = (item: JobRecord): Schemas['Job'] => pick(item, jobKeys);
function sessionDto(s: State, actor: Actor): Schemas['Session'] {
  const candidate = actor.candidateId ? s.candidates.get(actor.candidateId) : undefined;
  const company = actor.companyId ? s.companies.get(actor.companyId) : undefined;
  return {
    actorId: actor.id,
    role: actor.role,
    emailVerified:
      actor.role === 'candidate' ? must(candidate, 'candidate actor').emailVerified : Boolean(actor.emailVerified),
    candidateId: actor.candidateId,
    companyId: actor.companyId,
    displayName:
      actor.role === 'candidate'
        ? must(candidate, 'candidate actor').name
        : must(company, 'employer actor').displayName,
  };
}
function mutableAssessment(item: AssessmentRecord) {
  if (item.task.execution !== 'questionnaire')
    fail(422, 'assessment_format_retired', 'Эта демонстрационная задача архивирована. Начните новый тест знаний');
  if (item.status !== 'draft' && item.status !== 'in_progress')
    fail(409, 'assessment_not_editable', 'Проверка уже отправлена или завершена');
}
type JobExtra = Partial<Pick<JobRecord, 'sourceId' | 'assessmentId' | 'inputRevision'>>;
function createJob(
  s: State,
  actor: Actor,
  kind: JobRecord['kind'],
  work: () => JobResult,
  extra: JobExtra = {},
): Schemas['Job'] {
  const job: JobRecord = {
    id: nextId(s, 'job'),
    ownerActorId: actor.id,
    candidateId: actor.candidateId,
    kind,
    status: 'queued',
    createdAt: s.clock,
    updatedAt: s.clock,
    result: null,
    error: null,
    pollAfterMs: 250,
    simulation: true,
    work,
    ...extra,
  };
  s.jobs.set(job.id, job);
  for (const [delay, phase] of [
    [300, 'running'],
    [1000, 'complete'],
  ] as const) {
    const timer = setTimeout(() => {
      s.timers.delete(timer);
      advanceJob(s, job, phase);
    }, delay);
    timer.unref();
    s.timers.add(timer);
  }
  return jobDto(job);
}
function startSourceSync(s: State, actor: Actor, candidate: Candidate, source: Source): Schemas['Job'] {
  if (source.activeJobId) {
    const running = s.jobs.get(source.activeJobId);
    if (running && running.status !== 'succeeded' && running.status !== 'failed') return jobDto(running);
  }
  const job = createJob(
    s,
    actor,
    'source_sync',
    () => {
      for (const repo of source.repositories) if (repo.status === 'queued') repo.status = 'processed';
      source.counts = {
        found: source.repositories.length,
        processed: source.repositories.filter((repo) => repo.status === 'processed').length,
        queued: 0,
        unavailable: source.repositories.filter((repo) => repo.status === 'unavailable').length,
      };
      source.lastSyncedAt = s.clock;
      source.activeJobId = null;
      if (source.provider === 'github' && !candidate.skills.length)
        candidate.skills = makeSkills(candidate.id).map((skill) =>
          skill.status === 'confirmed'
            ? {
                ...skill,
                status: 'evidence',
                evidenceGrade: null,
                confirmedAt: null,
                evidenceSources: ['github'],
                summary: 'Есть свидетельства использования; уровень не проверен',
                evidence: evidenceFor(candidate.id, skill.skillId, 'evidence'),
              }
            : skill,
        );
      candidate.updatedAt = s.clock;
      return { kind: 'source_sync', source: structuredClone(source) };
    },
    { sourceId: source.id },
  );
  source.activeJobId = job.id;
  return job;
}
function completeAssessment(s: State, candidate: Candidate, item: AssessmentRecord): JobResult {
  const score = scoreKnowledge(item.grade, item.task, item.answer);
  if (!score) return fail(422, 'answer_incomplete', 'Ответьте на все вопросы теста');
  const outcome =
    s.scenario === 'service_failure'
      ? 'service_error'
      : s.scenario === 'assessment_failure' || !score.passed
        ? 'failed'
        : 'passed';
  const previousGrade = candidate.verifiedGrade;
  const gradeChanged =
    outcome === 'passed' &&
    (candidate.verifiedGrade !== item.grade || candidate.verifiedSpecialization !== item.specialization);
  if (outcome === 'passed') {
    if (
      candidate.verifiedSpecialization !== item.specialization ||
      !candidate.verifiedGrade ||
      rankOf(item.grade) >= rankOf(candidate.verifiedGrade)
    ) {
      candidate.verifiedGrade = item.grade;
      candidate.verifiedSpecialization = item.specialization;
      if (gradeChanged) candidate.gradeConfirmedAt = s.clock;
      for (const skillId of ['rust', 'postgresql'] as const) {
        const previous = candidate.skills.find((skill) => skill.skillId === skillId);
        const current = must(
          makeSkills(candidate.id, true).find((skill) => skill.skillId === skillId),
          `seed skill ${skillId}`,
        );
        const assessmentEvidence = {
          ...must(evidenceFor(candidate.id, skillId, 'confirmed')[0], 'assessment evidence'),
          id: `evidence-${item.id}-${skillId}`,
          reference: item.id,
          observedAt: s.clock,
        };
        const evidence = [...(previous?.evidence ?? []), assessmentEvidence];
        const updated = {
          ...current,
          evidenceGrade: item.grade,
          confirmedAt: s.clock,
          evidence,
          evidenceCount: evidence.length,
          evidenceSources: [...new Set(evidence.map((entry) => entry.source))],
        };
        const index = candidate.skills.findIndex((skill) => skill.skillId === skillId);
        if (index < 0) candidate.skills.push(updated);
        else candidate.skills[index] = updated;
      }
      candidate.revision += 1;
      candidate.updatedAt = s.clock;
    }
  }
  const outcomes = outcome === 'service_error' ? [] : score.rubric;
  item.status = outcome;
  item.checks = outcome === 'service_error' ? [] : score.checks;
  item.updatedAt = s.clock;
  item.revision += 1;
  item.result = {
    assessmentId: item.id,
    outcome,
    confirmedGrade: candidate.verifiedGrade,
    previousGrade,
    gradeChanged,
    rubric: outcomes,
    checks: item.checks,
    feedback:
      outcome === 'service_error'
        ? 'Ошибка демонстрационного оценивания. Грейд сохранён, штрафа и дополнительного ожидания нет.'
        : score.feedback,
    nextEligibleAt: candidate.gradeConfirmedAt
      ? plusDays(candidate.gradeConfirmedAt, s.policy.gradeChangeCooldownDays)
      : null,
    simulation: true,
  };
  return { kind: 'assessment', assessment: assessmentDto(item) };
}
function advanceJob(s: State, job: JobRecord, phase: 'running' | 'complete') {
  if (job.status === 'succeeded' || job.status === 'failed') return;
  const candidate = job.candidateId ? s.candidates.get(job.candidateId) : undefined;
  const assessment = job.assessmentId ? s.assessments.get(job.assessmentId) : undefined;
  if (candidate && !candidate.consents.processing) {
    job.status = 'failed';
    job.error = { code: 'processing_consent_revoked', message: 'Согласие на обработку отозвано', retryable: true };
    job.pollAfterMs = 0;
    if (job.sourceId) {
      const source = candidate.sources.find((item) => item.id === job.sourceId);
      if (source) source.activeJobId = null;
    }
    if (job.kind === 'assessment' && assessment) {
      assessment.status = 'service_error';
      assessment.updatedAt = s.clock;
    }
    return;
  }
  if (phase === 'running') {
    job.status = 'running';
    if (job.kind === 'assessment' && assessment) assessment.status = 'evaluating';
  } else if (job.kind === 'checks' && assessment?.revision !== job.inputRevision) {
    job.status = 'failed';
    job.error = {
      code: 'stale_input',
      message: 'Решение изменилось после запуска проверок. Запустите проверки повторно.',
      retryable: true,
    };
  } else {
    try {
      const result = job.work();
      job.result = result;
      job.status =
        result.kind === 'assessment' && result.assessment.status === 'service_error' ? 'failed' : 'succeeded';
      if (job.status === 'failed')
        job.error = {
          code: 'assessment_service_unavailable',
          message: 'Симулированная ошибка оценивания',
          retryable: true,
        };
    } catch {
      job.status = 'failed';
      job.error = { code: 'fixture_job_failed', message: 'Ошибка демонстрационного задания', retryable: true };
    }
  }
  if (job.status === 'succeeded' || job.status === 'failed') job.pollAfterMs = 0;
  job.updatedAt = s.clock;
}

type BodyOf<R> = R extends { body: infer Name extends keyof Schemas } ? Schemas[Name] : undefined;
type ActorOf<R> = R extends { auth: 'none' } ? Actor | null : Actor;
type ResultOf<R> = R extends { pdf: true }
  ? { pdfProfile: Schemas['Profile'] }
  : R extends { response: infer Name extends keyof Schemas }
    ? Schemas[Name]
    : null;
/** One handler per contract operation; its input and output types follow the route definition. */
type Handlers = { [R in Route as R['operationId']]: (ctx: Context<BodyOf<R>, ActorOf<R>>) => ResultOf<R> };

const handlers: Handlers = {
  getHealth: () => ({ status: 'ok', service: 'fsp-mock-api', version: '0.1.0' }),
  getMeta: ({ s }) => ({
    contractVersion: '0.1.0',
    mode: 'mock',
    serverTime: s.clock,
    scenario: s.scenario,
    capabilities: {
      emailVerification: true,
      realEmail: false,
      profilePdf: true,
      profilePdfImport: true,
      githubFixture: true,
      githubOAuth: false,
      fspFixture: true,
      matching: true,
      directInvitations: true,
      vacancyPublication: true,
      selfApplication: true,
      chat: false,
      recurringTasks: true,
      realCodeExecution: false,
      realLlm: false,
    },
    assessmentPolicy: {
      successfulGradeChangeCooldownDays: s.policy.gradeChangeCooldownDays,
      failedAttemptCooldownDays: 0,
      serviceFailureCooldownDays: 0,
      sameGradeRetryCooldownDays: 0,
      aiAllowed: true,
      externalAiAllowed: true,
      supportedScopes: [{ specialization: 'backend', grades: ['junior', 'middle', 'senior'] }],
    },
    competitions: COMPETITIONS,
    skills: SKILLS,
  }),
  createEmailChallenge: ({ s, body }) => {
    const existing = [...s.actors.values()].find((item) => item.email === body.email.toLowerCase());
    if (existing && existing.role !== body.role)
      fail(409, 'role_mismatch', 'Роль существующего аккаунта изменить нельзя');
    if (challengeAttempts(s, body.email.toLowerCase()) >= 5)
      fail(429, 'challenge_locked', 'Создайте новый запрос подтверждения');
    const item = {
      id: nextId(s, 'challenge'),
      role: body.role,
      email: body.email.toLowerCase(),
      code: '123456',
      expiresAt: new Date(Date.parse(s.clock) + 900000).toISOString(),
      used: false,
      attempts: 0,
    };
    s.challenges.set(item.id, item);
    return { challengeId: item.id, expiresAt: item.expiresAt, delivery: 'mock_mailbox' };
  },
  verifyEmail: ({ s, body }) => {
    const challenge = found(s.challenges.get(body.challengeId));
    if (Date.parse(challenge.expiresAt) <= Date.parse(s.clock))
      fail(400, 'challenge_expired', 'Срок действия кода истёк');
    if (challenge.used) fail(409, 'challenge_used', 'Код уже использован');
    if (challengeAttempts(s, challenge.email) >= 5)
      fail(429, 'challenge_locked', 'Создайте новый запрос подтверждения');
    if (challenge.code !== body.code) {
      challenge.attempts += 1;
      fail(400, 'invalid_code', 'Неверный код');
    }
    let actor = [...s.actors.values()].find((item) => item.email === challenge.email);
    if (!actor) {
      if (challenge.role === 'candidate') {
        const id = nextId(s, 'candidate');
        const candidate = makeCandidate(id, { name: 'Новый участник', email: challenge.email, fresh: true });
        candidate.alias = `Кандидат №${id.slice(-3)}`;
        s.candidates.set(id, candidate);
        actor = { id, role: 'candidate', candidateId: id, companyId: null, email: challenge.email };
      } else {
        const companyId = nextId(s, 'company');
        const id = nextId(s, 'employer');
        s.companies.set(companyId, {
          id: companyId,
          displayName: '',
          businessArea: '',
          description: '',
          contactEmail: challenge.email,
          website: null,
        });
        actor = { id, role: 'employer', candidateId: null, companyId, email: challenge.email, emailVerified: true };
      }
      s.actors.set(actor.id, actor);
    } else if (actor.role !== challenge.role) fail(409, 'role_mismatch', 'Роль существующего аккаунта изменить нельзя');
    challenge.used = true;
    if (actor.role === 'candidate')
      must(actor.candidateId ? s.candidates.get(actor.candidateId) : undefined, 'candidate actor').emailVerified = true;
    else actor.emailVerified = true;
    return sessionDto(s, actor);
  },
  logout: () => null,
  getSession: ({ s, actor }) => sessionDto(s, actor),
  mockSelectSession: ({ s, body }) => sessionDto(s, found(s.actors.get(body.actor))),
  mockReset: ({ domain, body }) => {
    domain.reset(body.scenario);
    return { scenario: body.scenario, clock: domain.state.clock };
  },
  mockAdvanceClock: ({ s, body }) => {
    s.clock = new Date(Date.parse(s.clock) + body.advanceSeconds * 1000).toISOString();
    return { clock: s.clock };
  },
  mockEmailCodes: ({ s }) => ({
    items: [...s.challenges.values()].map((item) => ({
      challengeId: item.id,
      ...pick(item, ['email', 'code', 'expiresAt', 'used']),
    })),
  }),
  getMyProfile: (ctx) => profileDto(ctx.s, me(ctx)),
  updateMyProfile: (ctx) => patchProfile(ctx.s, me(ctx), ctx.body),
  importMyProfile: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    return createJob(
      ctx.s,
      ctx.actor,
      'profile_import',
      () => ({
        kind: 'profile_import',
        preview: {
          name: 'Алексей Морозов',
          specialization: 'backend',
          selectedGrade: 'middle',
          stack: ['rust', 'postgresql', 'docker'],
          teamRole: 'Разработчик',
          experienceMonths: null,
          experience:
            'Демонстрационное извлечение: API на Rust и PostgreSQL. Содержимое загруженного файла не анализировалось.',
          softSkills: ['Командная работа'],
        },
        parser: 'fixture_preview',
        simulation: true,
      }),
      { inputRevision: candidate.revision },
    );
  },
  confirmProfileImport: (ctx) => {
    const job = jobFor(ctx, param(ctx, 'jobId'));
    if (job.kind !== 'profile_import') fail(404, 'not_found', 'Импорт не найден');
    if (job.status !== 'succeeded') fail(409, 'import_not_ready', 'Дождитесь завершения импорта');
    if (job.confirmed) fail(409, 'import_already_confirmed', 'Импорт уже применён');
    const candidate = me(ctx);
    processing(candidate);
    if (job.inputRevision !== undefined && candidate.revision !== job.inputRevision)
      fail(
        409,
        'import_profile_changed',
        'Профиль изменился после загрузки PDF. Загрузите файл заново, чтобы сохранить актуальные данные',
      );
    const updated = patchProfile(ctx.s, candidate, ctx.body.profile);
    job.confirmed = true;
    return updated;
  },
  exportMyProfile: (ctx) => ({ pdfProfile: profileDto(ctx.s, me(ctx)) }),
  authorizeGitHub: () => ({
    authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=fixture&state=fixture',
  }),
  getMySources: (ctx) => ({ items: me(ctx).sources, simulation: true }),
  connectMySource: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const provider = param(ctx, 'provider');
    const index = candidate.sources.findIndex((item) => item.provider === provider);
    if (index < 0) fail(404, 'not_found', 'Источник не найден');
    const [github, fsp] =
      provider === 'github'
        ? sources(candidate.id)
        : sources(candidate.id, {
            fspLinked: true,
            fspVerified: ctx.body.account === 'FSP-DEMO-024' || ctx.body.account === 'FSP-DEMO-031',
          });
    const connected = provider === 'github' ? github : fsp;
    connected.accountLabel = provider === 'fsp' ? ctx.body.account.trim().toUpperCase() : ctx.body.account;
    if (provider === 'fsp') {
      if (!/^[A-Za-z0-9_-]+$/.test(connected.accountLabel))
        fail(400, 'validation_error', 'Используйте буквы, цифры, дефис или подчёркивание в ФСП ID');
      connected.fspResults = fspResults(connected.accountLabel);
      connected.competitionIds = connected.fspResults
        .filter((r) => r.status === 'published')
        .map((r) => r.competitionId);
      connected.verifiedParticipation = connected.competitionIds.length > 0;
    }
    candidate.sources[index] = connected;
    startSourceSync(ctx.s, ctx.actor, candidate, connected);
    candidate.updatedAt = ctx.s.clock;
    return connected;
  },
  syncMySource: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const source = found(candidate.sources.find((item) => item.id === param(ctx, 'sourceId')));
    if (source.status !== 'connected') fail(409, 'source_not_connected', 'Сначала подключите источник');
    return startSourceSync(ctx.s, ctx.actor, candidate, source);
  },
  getMySkills: (ctx) => ({ items: me(ctx).skills, simulation: true }),
  getMyGraph: (ctx) => graph(me(ctx), 'self'),
  getMyGapPlan: (ctx) => {
    const needId = queryText(ctx.query, 'needId');
    const invitation = [...ctx.s.invitations.values()].find(
      (item) => item.candidateId === ctx.actor.candidateId && item.need.id === needId,
    );
    if (!invitation) return fail(404, 'not_found', 'Потребность недоступна этому кандидату');
    return gapPlan(me(ctx), invitation.needDefinition);
  },
  listMyAssessments: (ctx) => ({
    items: [...ctx.s.assessments.values()]
      .filter((item) => item.candidateId === ctx.actor.candidateId)
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(assessmentDto),
  }),
  startAssessment: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const form = onboarding(candidate);
    if (!form.emailVerified || !form.questionnaireComplete)
      fail(409, 'onboarding_incomplete', 'Подтвердите почту и заполните анкету');
    if (ctx.body.specialization !== 'backend')
      fail(422, 'assessment_scope_unavailable', 'Тесты знаний доступны только для бэкенда');
    if (
      [...ctx.s.assessments.values()].some(
        (item) =>
          item.candidateId === candidate.id &&
          activeAssessment.has(item.status) &&
          item.task.execution === 'questionnaire',
      )
    )
      fail(409, 'assessment_active', 'Сначала завершите текущую проверку');
    if (
      candidate.verifiedSpecialization === ctx.body.specialization &&
      rankOf(ctx.body.grade) < rankOf(candidate.verifiedGrade)
    )
      fail(422, 'grade_downgrade_forbidden', 'Проверка не должна понижать подтверждённый грейд');
    const changing =
      candidate.verifiedGrade &&
      (candidate.verifiedGrade !== ctx.body.grade || candidate.verifiedSpecialization !== ctx.body.specialization);
    if (
      changing &&
      candidate.gradeConfirmedAt &&
      Date.parse(plusDays(candidate.gradeConfirmedAt, ctx.s.policy.gradeChangeCooldownDays)) > Date.parse(ctx.s.clock)
    )
      fail(409, 'grade_change_cooldown', 'Изменить грейд можно после nextEligibleAt в профиле');
    for (const legacy of ctx.s.assessments.values()) {
      if (
        legacy.candidateId === candidate.id &&
        activeAssessment.has(legacy.status) &&
        legacy.task.execution !== 'questionnaire'
      ) {
        legacy.status = 'service_error';
        legacy.updatedAt = ctx.s.clock;
        legacy.revision += 1;
        legacy.result = {
          assessmentId: legacy.id,
          outcome: 'service_error',
          confirmedGrade: candidate.verifiedGrade,
          previousGrade: candidate.verifiedGrade,
          gradeChanged: false,
          rubric: [],
          checks: [],
          nextEligibleAt: null,
          feedback: 'Демонстрационная задача архивирована при переходе на тесты знаний. Оценка не выставлялась.',
          simulation: true,
        };
      }
    }
    const item: AssessmentRecord = {
      id: nextId(ctx.s, 'assessment'),
      candidateId: candidate.id,
      specialization: ctx.body.specialization,
      grade: ctx.body.grade,
      status: 'draft',
      task: knowledgeTask(ctx.body.grade),
      answer: { code: '', explanation: '', externalAiUsed: false, responses: [] },
      checks: [],
      result: null,
      createdAt: ctx.s.clock,
      updatedAt: ctx.s.clock,
      revision: 1,
      simulation: true,
    };
    ctx.s.assessments.set(item.id, item);
    return assessmentDto(item);
  },
  getAssessment: (ctx) => assessmentDto(assessmentFor(ctx, param(ctx, 'assessmentId'))),
  saveAssessmentAnswer: (ctx) => {
    const item = assessmentFor(ctx, param(ctx, 'assessmentId'));
    processing(me(ctx));
    mutableAssessment(item);
    if (!validKnowledgeAnswer(item.task, ctx.body))
      fail(400, 'validation_error', 'Ответ содержит неизвестный вопрос, вариант или повтор');
    item.answer = ctx.body;
    item.checks = knowledgeCompletion(item.task, item.answer);
    item.status = 'in_progress';
    item.revision += 1;
    item.updatedAt = ctx.s.clock;
    return assessmentDto(item);
  },
  runAssessmentChecks: (ctx) => {
    const item = assessmentFor(ctx, param(ctx, 'assessmentId'));
    processing(me(ctx));
    mutableAssessment(item);
    return createJob(
      ctx.s,
      ctx.actor,
      'checks',
      () => {
        item.checks = knowledgeCompletion(item.task, item.answer);
        return { kind: 'checks', assessmentId: item.id, checks: item.checks, simulation: true };
      },
      { assessmentId: item.id, inputRevision: item.revision },
    );
  },
  askAssessmentAssistant: (ctx) => {
    const item = assessmentFor(ctx, param(ctx, 'assessmentId'));
    processing(me(ctx));
    mutableAssessment(item);
    return {
      message:
        'Демонстрационный ответ: зафиксируйте ключ идемпотентности и создание заказа в одной транзакции. Добавьте уникальное ограничение, определите поведение конкурентных запросов и объясните повтор после ошибки. Ответ подготовлен заранее; модель не вызывалась.',
      simulation: true,
      aiAllowed: true,
      externalAiAllowed: true,
    };
  },
  submitAssessment: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const item = assessmentFor(ctx, param(ctx, 'assessmentId'));
    mutableAssessment(item);
    if (!scoreKnowledge(item.grade, item.task, item.answer))
      fail(422, 'answer_incomplete', 'Ответьте на все вопросы теста');
    item.status = 'submitted';
    item.updatedAt = ctx.s.clock;
    item.revision += 1;
    return createJob(ctx.s, ctx.actor, 'assessment', () => completeAssessment(ctx.s, candidate, item), {
      assessmentId: item.id,
    });
  },
  getJob: (ctx) => jobDto(jobFor(ctx, param(ctx, 'jobId'))),
  getMyTasks: (ctx) => {
    const candidate = me(ctx);
    const { from, to } = taskPeriod(ctx.s.clock);
    return {
      period: { from, to },
      ...taskOffer(ctx.s, candidate),
      history: responsesOf(ctx.s, candidate.id),
      freshness: freshness(ctx.s, candidate),
    };
  },
  respondToTask: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const offer = taskOffer(ctx.s, candidate);
    if (offer.currentResponse) fail(409, 'task_response_exists', 'Ответ на задание этой недели уже отправлен');
    if (offer.current?.id !== param(ctx, 'taskId')) fail(409, 'task_not_offered', 'Это задание сейчас не предложено');
    const item: TaskResponse = {
      id: nextId(ctx.s, 'task-response'),
      candidateId: candidate.id,
      candidateAlias: candidate.alias,
      task: must(offer.current, 'offered task'),
      mode: ctx.body.mode,
      answer: ctx.body.answer,
      status: 'submitted',
      feedback: null,
      submittedAt: ctx.s.clock,
      reviewedAt: null,
    };
    ctx.s.taskResponses.set(item.id, item);
    return item;
  },
  listMyInvitations: (ctx) => ({
    items: [...ctx.s.invitations.values()]
      .filter((item) => item.candidateId === ctx.actor.candidateId)
      .map(invitationDto),
  }),
  getMyInvitation: (ctx) => invitationDto(invitationFor(ctx, param(ctx, 'invitationId'))),
  viewMyInvitation: (ctx) => {
    const item = invitationFor(ctx, param(ctx, 'invitationId'));
    if (item.status === 'sent') {
      item.status = 'viewed';
      item.viewedAt = ctx.s.clock;
    }
    return invitationDto(item);
  },
  acceptMyInvitation: (ctx) => {
    const item = invitationFor(ctx, param(ctx, 'invitationId'));
    const candidate = me(ctx);
    const disclose = [...ctx.body.disclose].sort();
    if (item.status === 'accepted' && JSON.stringify([...item.disclosureFields].sort()) === JSON.stringify(disclose))
      return invitationDto(item);
    if (terminalStatus.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    if (!candidate.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту');
    item.status = 'accepted';
    item.respondedAt = ctx.s.clock;
    item.disclosureFields = disclose;
    refreshDisclosure(ctx.s, item.company.id, candidate);
    return invitationDto(item);
  },
  declineMyInvitation: (ctx) => {
    const item = invitationFor(ctx, param(ctx, 'invitationId'));
    if (item.status === 'declined') return invitationDto(item);
    if (terminalStatus.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    item.status = 'declined';
    item.respondedAt = ctx.s.clock;
    return invitationDto(item);
  },
  getCompany: ({ s, actor }) => companyDto(found(actor.companyId ? s.companies.get(actor.companyId) : undefined)),
  updateCompany: ({ s, actor, body }) => {
    if (body.website) {
      try {
        if (!new URL(body.website).hostname) fail(400, 'validation_error', 'Запрос не соответствует контракту');
      } catch {
        fail(400, 'validation_error', 'Запрос не соответствует контракту');
      }
    }
    const company = found(actor.companyId ? s.companies.get(actor.companyId) : undefined);
    Object.assign(company, body);
    return companyDto(company);
  },
  listNeeds: ({ s, actor }) => ({ items: [...s.needs.values()].filter((item) => item.companyId === actor.companyId) }),
  createNeed: (ctx) => {
    validateNeed(ctx.body);
    const item: Need = {
      ...structuredClone(ctx.body),
      id: nextId(ctx.s, 'need'),
      companyId: must(ctx.actor.companyId, 'employer company'),
      published: false,
      publishedAt: null,
      createdAt: ctx.s.clock,
      updatedAt: ctx.s.clock,
      revision: 1,
    };
    ctx.s.needs.set(item.id, item);
    return item;
  },
  getNeed: (ctx) => needFor(ctx, param(ctx, 'needId')),
  updateNeed: (ctx) => {
    const item = needFor(ctx, param(ctx, 'needId'));
    validateNeed({ ...item, ...ctx.body });
    Object.assign(item, structuredClone(ctx.body), { updatedAt: ctx.s.clock, revision: item.revision + 1 });
    return item;
  },
  deleteNeed: (ctx) => {
    const item = needFor(ctx, param(ctx, 'needId'));
    ctx.s.needs.delete(item.id);
    return null;
  },
  publishNeed: (ctx) => {
    const item = needFor(ctx, param(ctx, 'needId'));
    if (item.published) return item;
    const company = companyDto(found(ctx.actor.companyId ? ctx.s.companies.get(ctx.actor.companyId) : undefined));
    if (!company.readyToInvite)
      fail(422, 'company_incomplete', 'Заполните описание компании со сферой деятельности и контактную почту');
    if (!ctx.actor.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту работодателя');
    validateNeed(item);
    item.published = true;
    item.publishedAt = ctx.s.clock;
    return item;
  },
  unpublishNeed: (ctx) => {
    const item = needFor(ctx, param(ctx, 'needId'));
    item.published = false;
    item.publishedAt = null;
    return item;
  },
  getNeedGraph: (ctx) => {
    const need = needFor(ctx, param(ctx, 'needId'));
    const nodes: Schemas['GraphNode'][] = [
      { id: 'need-root', kind: 'role', label: need.title, skillId: null, status: null },
    ];
    const edges: Schemas['GraphEdge'][] = [];
    for (const requirement of need.requirements) {
      const id = `skill-${requirement.skillId}`;
      nodes.push({
        id,
        kind: 'skill',
        label: must(
          SKILLS.find((skill) => skill.id === requirement.skillId),
          'catalog skill',
        ).label,
        skillId: requirement.skillId,
        status: null,
      });
      edges.push({ id: `requires-${requirement.skillId}`, from: 'need-root', to: id, relation: 'requires' });
    }
    return { audience: 'employer', nodes, edges, simulation: true };
  },
  searchCandidates: (ctx) => {
    if (ctx.s.scenario === 'api_error')
      fail(503, 'fixture_search_unavailable', 'Демонстрационная ошибка поиска. Повторите запрос.');
    const needId = queryText(ctx.query, 'needId');
    const need = needId ? needFor(ctx, needId) : null;
    const mode = queryText(ctx.query, 'mode');
    if (mode === 'recommended' && !need) fail(422, 'need_required', 'Для рекомендаций выберите потребность');
    let items = [...ctx.s.candidates.values()].filter((candidate) => isVisible(ctx.s, candidate));
    if (mode === 'recommended' && need)
      items = items.filter(
        (candidate) =>
          candidate.verifiedSpecialization === need.specialization &&
          rankOf(candidate.verifiedGrade) >= rankOf(need.grade),
      );
    const specialization = queryText(ctx.query, 'specialization');
    const grade = queryText(ctx.query, 'grade');
    const skill = queryText(ctx.query, 'skill');
    if (specialization) items = items.filter((candidate) => candidate.verifiedSpecialization === specialization);
    if (grade) items = items.filter((candidate) => candidate.verifiedGrade === grade);
    if (skill)
      items = items.filter((candidate) =>
        candidate.skills.some((entry) => entry.skillId === skill && entry.status !== 'insufficient'),
      );
    if (queryText(ctx.query, 'fsp') === 'verified') items = items.filter(fspVerified);
    let result = items.map((candidate) => anonymous(ctx.s, candidate, need));
    result.sort((a, b) =>
      a.match && b.match
        ? Number(b.match.gradeMatches) - Number(a.match.gradeMatches) ||
          b.match.requiredMet - a.match.requiredMet ||
          b.match.desiredMet - a.match.desiredMet ||
          Number(b.fspVerified) - Number(a.fspVerified) ||
          a.id.localeCompare(b.id)
        : a.specialization.localeCompare(b.specialization) ||
          rank[b.verifiedGrade] - rank[a.verifiedGrade] ||
          Number(b.fspVerified) - Number(a.fspVerified) ||
          a.id.localeCompare(b.id),
    );
    const page = typeof ctx.query.page === 'number' ? ctx.query.page : 1;
    const pageSize = typeof ctx.query.pageSize === 'number' ? ctx.query.pageSize : 10;
    const total = result.length;
    result = result.slice((page - 1) * pageSize, page * pageSize);
    return { items: result, page, pageSize, total, hasNextPage: page * pageSize < total };
  },
  getCandidate: (ctx) => {
    const needId = queryText(ctx.query, 'needId');
    return anonymous(
      ctx.s,
      candidateForCompany(ctx.s, ctx.actor, param(ctx, 'candidateId')),
      needId ? needFor(ctx, needId) : null,
    );
  },
  getCandidateGraph: (ctx) => graph(candidateForCompany(ctx.s, ctx.actor, param(ctx, 'candidateId')), 'employer'),
  getCandidateGapPlan: (ctx) =>
    gapPlan(
      candidateForCompany(ctx.s, ctx.actor, param(ctx, 'candidateId')),
      needFor(ctx, must(queryText(ctx.query, 'needId'), 'validated needId')),
    ),
  getCandidateDisclosure: (ctx) => {
    const candidateId = param(ctx, 'candidateId');
    const companyId = must(ctx.actor.companyId, 'employer company');
    const grant = ctx.s.disclosures.get(`${companyId}:${candidateId}`);
    if (grant) return grant;
    candidateForCompany(ctx.s, ctx.actor, candidateId);
    return {
      candidateId,
      companyId,
      granted: false,
      invitationId: null,
      applicationId: null,
      grantedAt: null,
      fields: {},
    };
  },
  listShortlists: (ctx) => ({
    items: [...ctx.s.shortlists.values()]
      .filter((item) => item.companyId === ctx.actor.companyId)
      .map(shortlistSummary),
  }),
  createShortlist: (ctx) => {
    const item: ShortlistRecord = {
      id: nextId(ctx.s, 'shortlist'),
      companyId: must(ctx.actor.companyId, 'employer company'),
      title: ctx.body.title,
      memberIds: [],
      createdAt: ctx.s.clock,
      updatedAt: ctx.s.clock,
    };
    ctx.s.shortlists.set(item.id, item);
    return shortlistDetail(ctx.s, item);
  },
  getShortlist: (ctx) => shortlistDetail(ctx.s, shortlistFor(ctx, param(ctx, 'shortlistId'))),
  updateShortlist: (ctx) => {
    const item = shortlistFor(ctx, param(ctx, 'shortlistId'));
    item.title = ctx.body.title;
    item.updatedAt = ctx.s.clock;
    return shortlistDetail(ctx.s, item);
  },
  deleteShortlist: (ctx) => {
    const item = shortlistFor(ctx, param(ctx, 'shortlistId'));
    ctx.s.shortlists.delete(item.id);
    return null;
  },
  addShortlistMember: (ctx) => {
    const item = shortlistFor(ctx, param(ctx, 'shortlistId'));
    const candidateId = param(ctx, 'candidateId');
    visibleCandidate(ctx.s, candidateId);
    if (!item.memberIds.includes(candidateId)) item.memberIds.push(candidateId);
    item.updatedAt = ctx.s.clock;
    return shortlistDetail(ctx.s, item);
  },
  removeShortlistMember: (ctx) => {
    const item = shortlistFor(ctx, param(ctx, 'shortlistId'));
    const candidateId = param(ctx, 'candidateId');
    item.memberIds = item.memberIds.filter((id) => id !== candidateId);
    item.updatedAt = ctx.s.clock;
    return shortlistDetail(ctx.s, item);
  },
  listInvitations: (ctx) => ({
    items: [...ctx.s.invitations.values()].filter((item) => item.company.id === ctx.actor.companyId).map(invitationDto),
  }),
  createInvitation: (ctx) => {
    const company = companyDto(found(ctx.actor.companyId ? ctx.s.companies.get(ctx.actor.companyId) : undefined));
    if (!company.readyToInvite)
      fail(422, 'company_incomplete', 'Заполните описание компании со сферой деятельности и контактную почту');
    if (!ctx.actor.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту работодателя');
    const need = needFor(ctx, ctx.body.needId);
    validateNeed(need);
    const candidate = visibleCandidate(ctx.s, ctx.body.candidateId);
    if (
      [...ctx.s.invitations.values()].some(
        (item) =>
          item.company.id === company.id &&
          item.candidateId === candidate.id &&
          item.need.id === need.id &&
          (item.status === 'sent' || item.status === 'viewed' || item.status === 'accepted'),
      )
    )
      fail(409, 'invitation_exists', 'Приглашение по этой потребности уже существует');
    const item: InvitationRecord = {
      id: nextId(ctx.s, 'invitation'),
      candidateId: candidate.id,
      candidateAlias: candidate.alias,
      company: pick(company, ['id', 'displayName', 'businessArea', 'description', 'contactEmail']),
      need: structuredClone(pick(need, ['id', 'title', 'workMode', 'salary', 'description'])),
      needDefinition: structuredClone(need),
      message: ctx.body.message,
      status: 'sent',
      createdAt: ctx.s.clock,
      viewedAt: null,
      respondedAt: null,
      disclosureFields: [],
    };
    ctx.s.invitations.set(item.id, item);
    return invitationDto(item);
  },
  getInvitation: (ctx) => invitationDto(invitationFor(ctx, param(ctx, 'invitationId'))),
  listTasks: (ctx) => ({
    items: [...ctx.s.tasks.values()]
      .filter((task) => task.companyId === ctx.actor.companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((task) => taskDto(ctx.s, task)),
  }),
  createTask: (ctx) => {
    const company = companyDto(found(ctx.actor.companyId ? ctx.s.companies.get(ctx.actor.companyId) : undefined));
    if (!company.readyToInvite)
      fail(422, 'company_incomplete', 'Заполните описание компании со сферой деятельности и контактную почту');
    if (!ctx.actor.emailVerified) fail(403, 'email_not_verified', 'Подтвердите почту работодателя');
    const task: TaskRecord = {
      ...structuredClone(ctx.body),
      id: nextId(ctx.s, 'task'),
      companyId: company.id,
      status: 'active',
      createdAt: ctx.s.clock,
    };
    ctx.s.tasks.set(task.id, task);
    return taskDto(ctx.s, task);
  },
  archiveTask: (ctx) => {
    const task = taskFor(ctx, param(ctx, 'taskId'));
    task.status = 'archived';
    return taskDto(ctx.s, task);
  },
  listTaskResponses: (ctx) => {
    const taskId = queryText(ctx.query, 'taskId');
    return {
      items: [...ctx.s.taskResponses.values()]
        .filter((item) => item.task.company.id === ctx.actor.companyId && (!taskId || item.task.id === taskId))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id)),
    };
  },
  reviewTaskResponse: (ctx) => {
    const item = taskResponseFor(ctx, param(ctx, 'responseId'));
    const feedback = ctx.body.feedback.trim() || null;
    if (item.status !== 'submitted') {
      if (item.status === ctx.body.outcome && item.feedback === feedback) return item;
      fail(409, 'task_response_reviewed', 'Ответ уже оценён');
    }
    item.status = ctx.body.outcome;
    item.feedback = feedback;
    item.reviewedAt = ctx.s.clock;
    return item;
  },
  searchVacancies: (ctx) => {
    const candidate = me(ctx);
    const specialization = queryText(ctx.query, 'specialization');
    const grade = queryText(ctx.query, 'grade');
    const workMode = queryText(ctx.query, 'workMode');
    const skill = queryText(ctx.query, 'skill');
    const items = [...ctx.s.needs.values()]
      .filter(
        (need) =>
          need.published &&
          (!specialization || need.specialization === specialization) &&
          (!grade || need.grade === grade) &&
          (!workMode || need.workMode === workMode) &&
          (!skill || need.requirements.some((item) => item.skillId === skill)),
      )
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id))
      .map((need) => vacancyDto(ctx.s, need, candidate));
    const page = typeof ctx.query.page === 'number' ? ctx.query.page : 1;
    const pageSize = typeof ctx.query.pageSize === 'number' ? ctx.query.pageSize : 10;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: items.length,
      hasNextPage: page * pageSize < items.length,
    };
  },
  getVacancy: (ctx) => vacancyDto(ctx.s, publishedNeed(ctx.s, param(ctx, 'vacancyId')), me(ctx)),
  listMyApplications: (ctx) => ({
    items: [...ctx.s.applications.values()]
      .filter((item) => item.candidateId === ctx.actor.candidateId)
      .sort(newestFirst)
      .map((item) => applicationDto(ctx.s, item)),
  }),
  createApplication: (ctx) => {
    const candidate = me(ctx);
    processing(candidate);
    const need = publishedNeed(ctx.s, ctx.body.vacancyId);
    const { reason } = applicationEligibility(ctx.s, candidate, need);
    if (reason === 'application_exists') fail(409, 'application_exists', eligibilityMessage.application_exists);
    if (reason) fail(409, 'application_not_eligible', eligibilityMessage[reason]);
    const company = must(ctx.s.companies.get(need.companyId), 'vacancy company');
    const item: ApplicationRecord = {
      id: nextId(ctx.s, 'application'),
      candidateId: candidate.id,
      candidateAlias: candidate.alias,
      company: pick(company, ['id', 'displayName', 'businessArea', 'description', 'contactEmail']),
      vacancy: structuredClone(
        pick(need, ['id', 'title', 'specialization', 'grade', 'workMode', 'salary', 'description']),
      ),
      needDefinition: structuredClone(need),
      message: ctx.body.message,
      status: 'sent',
      createdAt: ctx.s.clock,
      viewedAt: null,
      respondedAt: null,
      disclosureFields: [...ctx.body.disclose].sort(),
    };
    ctx.s.applications.set(item.id, item);
    refreshDisclosure(ctx.s, company.id, candidate);
    return applicationDto(ctx.s, item);
  },
  getMyApplication: (ctx) => applicationDto(ctx.s, applicationFor(ctx, param(ctx, 'applicationId'))),
  withdrawMyApplication: (ctx) => {
    const item = applicationFor(ctx, param(ctx, 'applicationId'));
    if (item.status === 'withdrawn') return applicationDto(ctx.s, item);
    if (terminalStatus.has(item.status)) fail(409, 'application_terminal', 'Решение по отклику уже принято');
    item.status = 'withdrawn';
    item.respondedAt = ctx.s.clock;
    refreshDisclosure(ctx.s, item.company.id, me(ctx));
    return applicationDto(ctx.s, item);
  },
  listApplications: (ctx) => {
    const needId = queryText(ctx.query, 'needId');
    return {
      items: [...ctx.s.applications.values()]
        .filter((item) => item.company.id === ctx.actor.companyId && (!needId || item.vacancy.id === needId))
        .sort(newestFirst)
        .map((item) => applicationDto(ctx.s, item)),
    };
  },
  getApplication: (ctx) => applicationDto(ctx.s, applicationFor(ctx, param(ctx, 'applicationId'))),
  viewApplication: (ctx) => {
    const item = applicationFor(ctx, param(ctx, 'applicationId'));
    if (item.status === 'sent') {
      item.status = 'viewed';
      item.viewedAt = ctx.s.clock;
    }
    return applicationDto(ctx.s, item);
  },
  acceptApplication: (ctx) => {
    const item = applicationFor(ctx, param(ctx, 'applicationId'));
    if (item.status === 'accepted') return applicationDto(ctx.s, item);
    if (terminalStatus.has(item.status)) fail(409, 'application_terminal', 'Решение по отклику уже принято');
    item.status = 'accepted';
    item.viewedAt ??= ctx.s.clock;
    item.respondedAt = ctx.s.clock;
    return applicationDto(ctx.s, item);
  },
  declineApplication: (ctx) => {
    const item = applicationFor(ctx, param(ctx, 'applicationId'));
    if (item.status === 'declined') return applicationDto(ctx.s, item);
    if (terminalStatus.has(item.status)) fail(409, 'application_terminal', 'Решение по отклику уже принято');
    item.status = 'declined';
    item.viewedAt ??= ctx.s.clock;
    item.respondedAt = ctx.s.clock;
    return applicationDto(ctx.s, item);
  },
  withdrawInvitation: (ctx) => {
    const item = invitationFor(ctx, param(ctx, 'invitationId'));
    if (item.status === 'withdrawn') return invitationDto(item);
    if (terminalStatus.has(item.status)) fail(409, 'invitation_terminal', 'Решение по приглашению уже принято');
    item.status = 'withdrawn';
    item.respondedAt = ctx.s.clock;
    return invitationDto(item);
  },
};

export class MockDomain {
  readonly policy: { gradeChangeCooldownDays: number };
  state!: State;

  constructor({
    scenario = 'baseline',
    gradeChangeCooldownDays = 90,
  }: { scenario?: Scenario; gradeChangeCooldownDays?: number } = {}) {
    if (!Number.isInteger(gradeChangeCooldownDays) || gradeChangeCooldownDays < 0 || gradeChangeCooldownDays > 365)
      throw new Error('Invalid gradeChangeCooldownDays');
    this.policy = { gradeChangeCooldownDays };
    this.reset(scenario);
  }

  reset(scenario: Scenario = 'baseline') {
    this.close();
    this.state = createState(scenario);
    this.state.policy = { ...this.policy };
    for (const item of this.state.assessments.values())
      if (item.result) item.result.nextEligibleAt = plusDays(item.updatedAt, this.policy.gradeChangeCooldownDays);
    const actor = must(this.state.actors.get('candidate024'), 'seed actor');
    const candidate = must(this.state.candidates.get('candidate024'), 'seed candidate');
    for (const source of candidate.sources)
      if (source.status === 'connected' && source.counts.queued) startSourceSync(this.state, actor, candidate, source);
  }

  close() {
    for (const timer of this.state?.timers ?? []) clearTimeout(timer);
    this.state?.timers.clear();
  }

  /** Dispatches a request the server has already validated against the operation's schemas. */
  handle(operationId: OperationId, context: Omit<Context, 'domain' | 's'>): unknown {
    const handler = handlers[operationId] as (ctx: Context) => unknown;
    return handler({ domain: this, s: this.state, ...context });
  }
}

export const handledOperations = Object.keys(handlers);
