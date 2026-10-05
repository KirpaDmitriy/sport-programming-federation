export const CLOCK = '2026-10-05T12:00:00.000Z';
export const SKILLS = [
  { id: 'rust', label: 'Rust' }, { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'docker', label: 'Docker' }, { id: 'redis', label: 'Redis' }, { id: 'react', label: 'React' },
];
export const COMPETITIONS = [
  { id: 'competition-demo-api', name: 'Демо: проектирование надёжного API', synthetic: true, skillIds: ['rust', 'postgresql'], discipline: 'Продуктовое программирование' },
  { id: 'competition-demo-systems', name: 'Демо: распределённые системы', synthetic: true, skillIds: ['docker', 'redis'], discipline: 'Продуктовое программирование' },
];
export const RUBRIC = [
  { id: 'correctness', label: 'Корректность', weight: 4 },
  { id: 'reliability', label: 'Надёжность', weight: 3 },
  { id: 'tests', label: 'Проверки', weight: 2 },
  { id: 'explanation', label: 'Объяснение решения', weight: 1 },
];
export const TASK = {
  id: 'task-idempotency-v1', family: 'idempotent-api', version: '1', variantId: 'orders-middle-a',
  title: 'Идемпотентное создание заказа', language: 'rust',
  prompt: 'Опишите и реализуйте обработку создания заказа с ключом идемпотентности. Повторный и одновременный запросы с одним ключом должны возвращать один результат. Объясните границы транзакции и поведение после ошибки. Это демонстрационная проверка: код здесь не исполняется, результаты берутся из сценария.',
  starterCode: 'pub async fn create_order(key: &str, payload: OrderInput) -> Result<Order, Error> {\n    todo!()\n}\n',
  acceptanceCriteria: ['Первый запрос создаёт заказ', 'Повторный запрос возвращает тот же заказ', 'Одновременные запросы не создают дубликаты', 'Повтор после ошибки не оставляет неконсистентные данные'],
  rubric: RUBRIC, aiAllowed: true, externalAiAllowed: true, execution: 'simulated',
};
export function checks(outcome = 'preview') {
  return TASK.acceptanceCriteria.map((label, index) => ({
    id: `check-${index + 1}`, label,
    status: outcome === 'pass' || index < 2 ? 'passed' : outcome === 'fail' || index === 2 ? 'failed' : 'not_run',
    message: outcome === 'pass' ? 'Успешно в демонстрационном сценарии' : index < 2 ? 'Успешно в демонстрационном сценарии' : index === 2 ? 'Проверьте атомарность операции' : 'Проверка ещё не запускалась',
  }));
}
const gradeDate = '2026-06-01T12:00:00.000Z';
const period = { from: '2026-06-01T00:00:00.000Z', to: CLOCK };
const names = ['order-api', 'queue-worker', 'metrics-api', 'data-tools', 'task-runner', 'auth-example', 'migration-kit', 'cli-tools', 'billing-api', 'cache-service', 'search-demo', 'legacy-api'];

export function sources(candidateId, options = {}) {
  const connected = options.github !== false;
  const repositories = connected ? names.map((name, index) => ({
    id: `repo-${candidateId}-${index + 1}`, name,
    url: `https://example.com/fixtures/github/${name}`,
    technologies: index === 1 ? ['rust', 'redis'] : index < 8 ? ['rust', 'postgresql', 'docker'] : ['rust'],
    status: index < 8 ? 'processed' : index < 11 ? 'queued' : 'unavailable',
  })) : [];
  return [
    {
      id: `source-${candidateId}-github`, provider: 'github', status: connected ? 'connected' : 'not_connected', synthetic: true, activeJobId: null,
      accountLabel: connected ? 'Демо GitHub' : null, lastSyncedAt: connected ? CLOCK : null,
      counts: connected ? { found: 12, processed: 8, queued: 3, unavailable: 1 } : { found: 0, processed: 0, queued: 0, unavailable: 0 },
      repositories, activeDays: connected ? 27 : null, observationPeriod: connected ? period : null,
      verifiedParticipation: false, competitionIds: [],
      notice: 'Демонстрационные открытые данные. Анализ выполняется автоматически. Часы работы по GitHub не измеряются.',
    },
    {
      id: `source-${candidateId}-fsp`, provider: 'fsp', status: options.fspLinked || options.fspVerified ? 'connected' : 'not_connected', synthetic: true, activeJobId: null,
      accountLabel: options.fspLinked || options.fspVerified ? `FSP-DEMO-${candidateId.slice(-3)}` : null,
      lastSyncedAt: options.fspLinked || options.fspVerified ? CLOCK : null,
      counts: { found: 0, processed: 0, queued: 0, unavailable: 0 }, repositories: [], activeDays: null, observationPeriod: null,
      verifiedParticipation: Boolean(options.fspVerified), competitionIds: options.fspVerified ? ['competition-demo-api'] : [],
      notice: 'Синтетический источник ФСП. Реальный API и данные участников не подключены. Участие в ФСП необязательно.',
    },
  ];
}

export function evidenceFor(candidateId, skill, status) {
  if (status === 'insufficient') return [];
  return [{
    id: `evidence-${candidateId}-${skill}`, source: status === 'confirmed' ? 'assessment' : 'github',
    title: status === 'confirmed' ? 'Практическая проверка' : skill === 'postgresql' ? 'Транзакции в order-api' : 'Использование технологии в проекте',
    url: status === 'confirmed' ? null : 'https://example.com/fixtures/github/order-api/pull/17',
    reference: status === 'confirmed' ? `assessment-seed-${candidateId}` : 'PR #17',
    observedAt: CLOCK, scope: 'individual', synthetic: true,
  }];
}
export function makeSkills(candidateId, qualified = false, missingPostgres = false, frontend = false) {
  return SKILLS.filter((skill) => frontend ? skill.id === 'react' : skill.id !== 'react').map((skill) => {
    const status = frontend || skill.id === 'rust' || (skill.id === 'postgresql' && qualified && !missingPostgres) ? 'confirmed' : skill.id === 'postgresql' ? (missingPostgres ? 'insufficient' : 'evidence') : skill.id === 'docker' ? 'observed' : 'insufficient';
    const evidence = evidenceFor(candidateId, skill.id, status);
    return {
      skillId: skill.id, label: skill.label, status,
      evidenceGrade: status === 'confirmed' ? qualified || frontend ? 'middle' : 'junior' : null,
      evidenceSources: evidence.map((item) => item.source),
      summary: ({ confirmed: 'Подтверждено практической проверкой', evidence: 'Есть свидетельства использования; целевой уровень ещё не проверен', observed: 'Технология найдена в проекте; уровень не подтверждён', insufficient: 'Недостаточно свидетельств' })[status],
      evidenceCount: evidence.length, confirmedAt: status === 'confirmed' ? gradeDate : null, evidence,
    };
  });
}
export function makeCandidate(id, { name, email, qualified = false, missingPostgres = false, frontend = false, fspLinked = false, fspVerified = false, fresh = false } = {}) {
  return {
    id, alias: `Кандидат №${id.slice(-3)}`, name, email, emailVerified: !fresh,
    industry: 'it', specialization: frontend ? 'frontend' : 'backend', selectedGrade: fresh ? 'junior' : 'middle',
    verifiedGrade: fresh ? null : qualified || frontend ? 'middle' : 'junior',
    verifiedSpecialization: fresh ? null : frontend ? 'frontend' : 'backend', gradeConfirmedAt: fresh ? null : gradeDate,
    stack: fresh ? [] : frontend ? ['react'] : ['rust', 'postgresql', 'docker'],
    teamRole: fresh ? '' : 'Разработчик', experienceMonths: fresh ? null : 18, experience: fresh ? '' : 'Разработка API и командная работа над учебными и открытыми проектами.',
    softSkills: fresh ? [] : ['Командная работа', 'Объяснение решений'], consents: { processing: !fresh, publication: !fresh },
    revision: 1, updatedAt: CLOCK, workModes: ['remote'],
    skills: fresh ? [] : makeSkills(id, qualified, missingPostgres, frontend),
    sources: sources(id, { fspLinked, fspVerified, github: !fresh }),
  };
}
export const DEFAULT_POLICY = { acceptAssessments: true, acceptGithub: true, acceptFsp: true, competitionSelection: 'system', competitionIds: [] };
function need(companyId, id) {
  return {
    id, companyId, title: 'Бэкенд-разработчик', specialization: 'backend', grade: 'middle', workMode: 'remote',
    salary: { from: 200000, to: 260000, currency: 'RUB', period: 'month', taxBasis: 'gross' },
    description: 'Разработка надёжных API на Rust и PostgreSQL. Удалённая работа, задачи по надёжности и качеству сервисов.',
    requirements: ['rust', 'postgresql', 'docker', 'redis'].map((skillId, index) => ({ skillId, criticality: index < 2 ? 'required' : 'desired', minimumGrade: 'middle', evidencePolicy: structuredClone(DEFAULT_POLICY) })),
    published: false, createdAt: CLOCK, updatedAt: CLOCK, revision: 1,
  };
}

export function createState(scenario = 'baseline') {
  const candidates = new Map([
    ['candidate024', makeCandidate('candidate024', { name: 'Алексей Морозов', email: 'alexey@example.com', qualified: scenario === 'qualified' })],
    ['candidate018', makeCandidate('candidate018', { name: 'Демо Участник 018', email: 'participant018@example.com', qualified: true, missingPostgres: true, fspLinked: true })],
    ['candidate031', makeCandidate('candidate031', { name: 'Демо Участник 031', email: 'participant031@example.com', qualified: true, fspVerified: true })],
    ['candidate041', makeCandidate('candidate041', { name: 'Демо Участник 041', email: 'participant041@example.com', frontend: true })],
    ['candidate-new', makeCandidate('candidate-new', { name: 'Новый участник', email: 'new@example.com', fresh: true })],
  ]);
  candidates.get('candidate-new').alias = 'Новый участник';
  if (scenario === 'qualified') { candidates.get('candidate024').gradeConfirmedAt = CLOCK; for (const skill of candidates.get('candidate024').skills) if (skill.status === 'confirmed') skill.confirmedAt = CLOCK; }
  if (scenario === 'no_fsp') for (const item of candidates.values()) item.sources[1] = sources(item.id)[1];
  const companies = new Map([
    ['company-a', { id: 'company-a', displayName: 'Север Тех', businessArea: 'Разработка программного обеспечения', description: 'Демонстрационная технологическая компания. Разрабатываем сервисы для управления заказами и логистикой.', contactEmail: 'hr@sever-tech.example', website: 'https://example.com/sever-tech' }],
    ['company-b', { id: 'company-b', displayName: 'Вторая компания', businessArea: 'Информационные технологии', description: 'Вторая демонстрационная компания для проверки разграничения доступа.', contactEmail: 'hr@second-company.example', website: null }],
  ]);
  const actors = new Map([
    ['candidate024', { id: 'candidate024', role: 'candidate', candidateId: 'candidate024', companyId: null, email: 'alexey@example.com' }],
    ['candidate-new', { id: 'candidate-new', role: 'candidate', candidateId: 'candidate-new', companyId: null, email: 'new@example.com' }],
    ['employer-a', { id: 'employer-a', role: 'employer', candidateId: null, companyId: 'company-a', email: 'hr@sever-tech.example', emailVerified: true }],
    ['employer-b', { id: 'employer-b', role: 'employer', candidateId: null, companyId: 'company-b', email: 'hr@second-company.example', emailVerified: true }],
  ]);
  const initial = candidates.get('candidate024');
  const confirmedAt = initial.gradeConfirmedAt;
  const historyId = 'assessment-seed-candidate024';
  const history = {
    id: historyId, candidateId: initial.id, specialization: 'backend', grade: initial.verifiedGrade, status: 'passed',
    task: { ...structuredClone(TASK), variantId: `orders-${initial.verifiedGrade}-a` },
    answer: { code: '// Демонстрационный результат ранее завершённой проверки', explanation: 'Исторический результат из набора демонстрационных данных.', externalAiUsed: true },
    checks: checks('pass'), result: { assessmentId: historyId, outcome: 'passed', confirmedGrade: initial.verifiedGrade, previousGrade: scenario === 'qualified' ? 'junior' : null, gradeChanged: true, rubric: RUBRIC.map((criterion) => ({ criterionId: criterion.id, label: criterion.label, outcome: 'met', feedback: 'Критерий выполнен в демонстрационном наборе.' })), checks: checks('pass'), feedback: 'Исторический демонстрационный результат.', nextEligibleAt: new Date(Date.parse(confirmedAt) + 90 * 86400000).toISOString(), simulation: true },
    createdAt: confirmedAt, updatedAt: confirmedAt, revision: 1, simulation: true,
  };
  return {
    scenario, clock: CLOCK, policy: { gradeChangeCooldownDays: 90 }, timers: new Set(), candidates, companies, actors, sessions: new Map(), challenges: new Map(),
    needs: new Map([['need-001', need('company-a', 'need-001')], ['need-b-001', need('company-b', 'need-b-001')]]),
    shortlists: new Map([['shortlist-001', { id: 'shortlist-001', companyId: 'company-a', title: 'Бэкенд · Мидл', memberIds: ['candidate024', 'candidate018', 'candidate041'], createdAt: CLOCK, updatedAt: CLOCK }]]),
    invitations: new Map(), disclosures: new Map(), assessments: new Map([[historyId, history]]), jobs: new Map(), idempotency: new Map(), counters: {},
  };
}

export function nextId(state, prefix) {
  let id;
  do {
    state.counters[prefix] = (state.counters[prefix] ?? 0) + 1;
    id = `${prefix}-${String(state.counters[prefix]).padStart(3, '0')}`;
  } while (Object.values(state).some((value) => value instanceof Map && value.has(id)));
  return id;
}
