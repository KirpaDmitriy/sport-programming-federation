// The contract's single source: JSON Schemas and the route table. scripts/build-contract.ts writes them to
// contracts/openapi.json; the server validates requests and responses against the same schemas.

export type JsonSchema = { readonly [keyword: string]: unknown };

const str = (extra: JsonSchema = {}): JsonSchema => ({ type: 'string', ...extra });
const num = (extra: JsonSchema = {}): JsonSchema => ({ type: 'integer', ...extra });
const bool: JsonSchema = { type: 'boolean' };
const en = (...values: string[]): JsonSchema => ({ type: 'string', enum: values });
const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: JsonSchema, extra: JsonSchema = {}): JsonSchema => ({ type: 'array', items, ...extra });
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
  extra: JsonSchema = {},
): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false, ...extra });
const dt = str({ format: 'date-time' });
const id = str({ minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9_.:-]+$' });
const email = str({ format: 'email', maxLength: 254 });
const url = str({ format: 'uri', maxLength: 2048 });
const companyUrl = str({ format: 'uri', maxLength: 2048, pattern: '^https?://[^/?#\\s]+(?:[/?#][^\\s]*)?$' });
const grade = en('junior', 'middle', 'senior');
const specialization = en('backend', 'frontend', 'fullstack');
const skillId = en('rust', 'postgresql', 'docker', 'redis', 'react');
const skillStatus = en('confirmed', 'evidence', 'observed', 'insufficient');
const provider = en('github', 'fsp');
const sourceKind = en('github', 'fsp', 'assessment');
const workMode = en('remote', 'hybrid', 'office');
const fields = arr(en('name', 'email', 'sourceLinks'), { minItems: 1, uniqueItems: true });
const consent = obj({ processing: bool, publication: bool });
const companyCard = obj({ id, displayName: str(), businessArea: str(), description: str(), contactEmail: email });
const interactionStatus = en('sent', 'viewed', 'accepted', 'declined', 'withdrawn');
const profileEditable = {
  name: str({ minLength: 1, maxLength: 120 }),
  industry: en('it'),
  specialization,
  selectedGrade: grade,
  stack: arr(skillId, { uniqueItems: true, maxItems: 5 }),
  teamRole: str({ maxLength: 120 }),
  experienceMonths: nullable(num({ minimum: 0, maximum: 1200 })),
  experience: str({ maxLength: 4000 }),
  softSkills: arr(str({ maxLength: 100 }), { maxItems: 12, uniqueItems: true }),
  consents: consent,
};

export const schemas = {
  Error: obj({ code: str(), message: str(), requestId: str(), details: arr(obj({ path: str(), message: str() })) }),
  Health: obj({ status: en('ok'), service: en('fsp-mock-api', 'fsp-career-api'), version: en('0.1.0') }),
  Meta: obj({
    contractVersion: en('0.1.0'),
    mode: en('mock', 'live'),
    serverTime: dt,
    scenario: str(),
    capabilities: obj(
      Object.fromEntries(
        [
          'emailVerification',
          'profilePdf',
          'githubFixture',
          'githubOAuth',
          'fspFixture',
          'matching',
          'directInvitations',
          'vacancyPublication',
          'selfApplication',
          'chat',
          'recurringTasks',
          'realCodeExecution',
          'realLlm',
        ].map((key) => [key, bool]),
      ),
    ),
    assessmentPolicy: obj({
      successfulGradeChangeCooldownDays: num(),
      failedAttemptCooldownDays: num(),
      serviceFailureCooldownDays: num(),
      sameGradeRetryCooldownDays: num(),
      aiAllowed: bool,
      externalAiAllowed: bool,
      supportedScopes: arr(obj({ specialization, grades: arr(grade) })),
    }),
    competitions: arr(obj({ id, name: str(), synthetic: bool, skillIds: arr(skillId), discipline: str() })),
    skills: arr(obj({ id: skillId, label: str() })),
  }),
  Session: obj({
    actorId: id,
    role: en('candidate', 'employer'),
    emailVerified: bool,
    candidateId: nullable(id),
    companyId: nullable(id),
    displayName: str(),
  }),
  EmailChallengeInput: obj({ email, role: en('candidate', 'employer') }),
  EmailChallenge: obj({ challengeId: id, expiresAt: dt, delivery: en('mock_mailbox', 'email') }),
  EmailVerifyInput: obj({ challengeId: id, code: str({ pattern: '^[0-9]{6}$' }) }),
  GradeEligibility: obj({
    selectedSpecialization: specialization,
    selectedGrade: grade,
    canStartSelected: bool,
    selectedReason: nullable(
      en('cooldown', 'onboarding_incomplete', 'active_assessment', 'unsupported_scope', 'grade_downgrade'),
    ),
    canStartUpgrade: bool,
    nextEligibleAt: nullable(dt),
    cooldownDays: num(),
    reason: nullable(en('cooldown', 'onboarding_incomplete', 'active_assessment')),
  }),
  Onboarding: obj({
    emailVerified: bool,
    questionnaireComplete: bool,
    assessmentPassed: bool,
    readyForPublication: bool,
    visibleToEmployers: bool,
    blockers: arr(en('email', 'questionnaire', 'assessment', 'processing_consent', 'publication_consent')),
  }),
  Category: obj({ specialization: nullable(specialization), grade: nullable(grade), eligible: bool }),
  Freshness: obj({
    lastSignalAt: nullable(dt),
    lastSignal: nullable(en('assessment', 'task')),
    fresh: bool,
    windowDays: num({ minimum: 1 }),
  }),
  Profile: obj({
    id,
    alias: str(),
    email,
    emailVerified: bool,
    ...profileEditable,
    verifiedGrade: nullable(grade),
    verifiedSpecialization: nullable(specialization),
    gradeConfirmedAt: nullable(dt),
    category: ref('Category'),
    freshness: ref('Freshness'),
    onboarding: ref('Onboarding'),
    assessmentEligibility: ref('GradeEligibility'),
    revision: num({ minimum: 1 }),
    updatedAt: dt,
  }),
  ProfilePatch: obj(profileEditable, [], { minProperties: 1 }),
  ImportPreview: obj({
    name: str(),
    specialization,
    selectedGrade: grade,
    stack: arr(skillId),
    teamRole: str(),
    experienceMonths: nullable(num({ minimum: 0, maximum: 1200 })),
    experience: str(),
    softSkills: arr(str()),
  }),
  ImportConfirmInput: obj({ profile: ref('ProfilePatch') }),
  Evidence: obj({
    id,
    source: sourceKind,
    title: str(),
    url: nullable(url),
    reference: nullable(str()),
    observedAt: dt,
    scope: en('individual', 'team'),
    synthetic: bool,
  }),
  Skill: obj({
    skillId,
    label: str(),
    status: skillStatus,
    evidenceGrade: nullable(grade),
    evidenceSources: arr(sourceKind, { uniqueItems: true }),
    summary: str(),
    evidenceCount: num({ minimum: 0 }),
    confirmedAt: nullable(dt),
  }),
  SelfSkill: obj({
    ...{
      skillId,
      label: str(),
      status: skillStatus,
      evidenceGrade: nullable(grade),
      evidenceSources: arr(sourceKind, { uniqueItems: true }),
      summary: str(),
      evidenceCount: num({ minimum: 0 }),
      confirmedAt: nullable(dt),
    },
    evidence: arr(ref('Evidence')),
  }),
  Skills: obj({ items: arr(ref('SelfSkill')), simulation: bool }),
  GitHubAuthorization: obj({ authorizationUrl: url }),
  Repository: obj({
    id,
    name: str(),
    url,
    technologies: arr(skillId),
    status: en('processed', 'queued', 'unavailable'),
    metrics: obj({
      stars: num({ minimum: 0 }),
      forks: num({ minimum: 0 }),
      openIssues: num({ minimum: 0 }),
      sizeKib: num({ minimum: 0 }),
      pushedAt: nullable(dt),
    }),
  }),
  Source: obj({
    id,
    provider,
    status: en('connected', 'not_connected'),
    synthetic: bool,
    activeJobId: nullable(id),
    accountLabel: nullable(str()),
    lastSyncedAt: nullable(dt),
    counts: obj({
      found: num({ minimum: 0 }),
      processed: num({ minimum: 0 }),
      queued: num({ minimum: 0 }),
      unavailable: num({ minimum: 0 }),
    }),
    repositories: arr(ref('Repository')),
    activeDays: nullable(num({ minimum: 0 })),
    observationPeriod: nullable(obj({ from: dt, to: dt })),
    verifiedParticipation: bool,
    competitionIds: arr(id),
    notice: str(),
  }),
  Sources: obj({ items: arr(ref('Source')), simulation: bool }),
  SourceConnectInput: obj({ account: str({ minLength: 1, maxLength: 100 }) }),
  GraphNode: obj({
    id,
    kind: en('role', 'skill', 'evidence'),
    label: str(),
    skillId: nullable(skillId),
    status: nullable(skillStatus),
  }),
  GraphEdge: obj({ id, from: id, to: id, relation: en('requires', 'supports', 'uses') }),
  Graph: obj({
    audience: en('self', 'employer'),
    nodes: arr(ref('GraphNode')),
    edges: arr(ref('GraphEdge')),
    simulation: bool,
  }),
  EvidencePolicy: obj({
    acceptAssessments: bool,
    acceptGithub: bool,
    acceptFsp: bool,
    competitionSelection: en('system', 'selected'),
    competitionIds: arr(id, { uniqueItems: true }),
  }),
  Requirement: obj({
    skillId,
    criticality: en('required', 'desired'),
    minimumGrade: grade,
    evidencePolicy: ref('EvidencePolicy'),
  }),
  Salary: obj({
    from: num({ minimum: 1, maximum: 100000000 }),
    to: num({ minimum: 1, maximum: 100000000 }),
    currency: en('RUB'),
    period: en('month'),
    taxBasis: en('gross'),
  }),
  Company: obj({
    id,
    displayName: str(),
    businessArea: str(),
    description: str(),
    contactEmail: email,
    website: nullable(companyUrl),
    readyToInvite: bool,
  }),
  CompanyPatch: obj(
    {
      displayName: str({ minLength: 1, maxLength: 120 }),
      businessArea: str({ maxLength: 200 }),
      description: str({ maxLength: 4000 }),
      contactEmail: email,
      website: nullable(companyUrl),
    },
    [],
    { minProperties: 1 },
  ),
  NeedInput: obj({
    title: str({ minLength: 1, maxLength: 160 }),
    specialization,
    grade,
    workMode,
    salary: ref('Salary'),
    description: str({ maxLength: 6000 }),
    requirements: arr(ref('Requirement'), { minItems: 1, maxItems: 5 }),
  }),
  NeedPatch: obj(
    {
      title: str({ minLength: 1, maxLength: 160 }),
      specialization,
      grade,
      workMode,
      salary: ref('Salary'),
      description: str({ maxLength: 6000 }),
      requirements: arr(ref('Requirement'), { minItems: 1, maxItems: 5 }),
    },
    [],
    { minProperties: 1 },
  ),
  Need: obj({
    id,
    companyId: id,
    title: str(),
    specialization,
    grade,
    workMode,
    salary: ref('Salary'),
    description: str(),
    requirements: arr(ref('Requirement')),
    published: bool,
    publishedAt: nullable(dt),
    createdAt: dt,
    updatedAt: dt,
    revision: num({ minimum: 1 }),
  }),
  Needs: obj({ items: arr(ref('Need')) }),
  MatchRequirement: obj({
    skillId,
    criticality: en('required', 'desired'),
    status: en('meets', 'needs_verification', 'not_evidenced'),
    evidenceStatus: skillStatus,
    reason: str(),
  }),
  Match: obj({
    needId: id,
    status: en('meets_required', 'needs_verification', 'missing_required'),
    gradeMatches: bool,
    requiredMet: num({ minimum: 0 }),
    requiredTotal: num({ minimum: 0 }),
    desiredMet: num({ minimum: 0 }),
    desiredTotal: num({ minimum: 0 }),
    requirements: arr(ref('MatchRequirement')),
    explanation: str(),
    algorithmVersion: str({ minLength: 1 }),
  }),
  AnonymousCandidate: obj({
    id,
    alias: str(),
    specialization,
    verifiedGrade: grade,
    gradeConfirmedAt: dt,
    workModes: arr(workMode),
    availableForOffers: bool,
    skills: arr(ref('Skill')),
    sourceKinds: arr(sourceKind, { uniqueItems: true }),
    fspVerified: bool,
    freshness: ref('Freshness'),
    match: nullable(ref('Match')),
    simulation: bool,
  }),
  CandidatePage: obj({
    items: arr(ref('AnonymousCandidate')),
    page: num({ minimum: 1 }),
    pageSize: num({ minimum: 1 }),
    total: num({ minimum: 0 }),
    hasNextPage: bool,
  }),
  GapItem: obj({
    skillId,
    status: en('needs_verification', 'not_evidenced'),
    reason: str(),
    action: str(),
    acceptedCompetitionIds: arr(id),
    assessmentAvailable: bool,
  }),
  GapPlan: obj({ candidateId: id, needId: id, items: arr(ref('GapItem')), simulation: bool }),
  ShortlistInput: obj({ title: str({ minLength: 1, maxLength: 120 }) }),
  ShortlistSummary: obj({ id, title: str(), count: num({ minimum: 0 }), createdAt: dt, updatedAt: dt }),
  Shortlists: obj({ items: arr(ref('ShortlistSummary')) }),
  ShortlistMember: obj({ candidateId: id, alias: str(), available: bool }),
  Shortlist: obj({
    id,
    title: str(),
    count: num({ minimum: 0 }),
    createdAt: dt,
    updatedAt: dt,
    members: arr(ref('ShortlistMember')),
  }),
  InvitationInput: obj({ candidateId: id, needId: id, message: str({ minLength: 1, maxLength: 4000 }) }),
  Invitation: obj({
    id,
    candidateId: id,
    candidateAlias: str(),
    company: companyCard,
    need: obj({ id, title: str(), workMode, salary: ref('Salary'), description: str() }),
    message: str(),
    status: interactionStatus,
    createdAt: dt,
    viewedAt: nullable(dt),
    respondedAt: nullable(dt),
    disclosureFields: arr(en('name', 'email', 'sourceLinks'), { uniqueItems: true }),
  }),
  Invitations: obj({ items: arr(ref('Invitation')) }),
  AcceptInvitationInput: obj({ disclose: fields }),
  Disclosure: obj({
    candidateId: id,
    companyId: id,
    granted: bool,
    invitationId: nullable(id),
    applicationId: nullable(id),
    grantedAt: nullable(dt),
    fields: obj({ name: str(), email, sourceLinks: arr(url) }, []),
  }),
  VacancyRequirement: obj({ skillId, criticality: en('required', 'desired'), minimumGrade: grade }),
  ApplicationEligibility: obj({
    canApply: bool,
    reason: nullable(en('email', 'questionnaire', 'assessment', 'processing_consent', 'application_exists')),
  }),
  Vacancy: obj({
    id,
    company: companyCard,
    title: str(),
    specialization,
    grade,
    workMode,
    salary: ref('Salary'),
    description: str(),
    requirements: arr(ref('VacancyRequirement')),
    publishedAt: dt,
    updatedAt: dt,
    match: nullable(ref('Match')),
    applicationId: nullable(id),
    eligibility: ref('ApplicationEligibility'),
  }),
  VacancyPage: obj({
    items: arr(ref('Vacancy')),
    page: num({ minimum: 1 }),
    pageSize: num({ minimum: 1 }),
    total: num({ minimum: 0 }),
    hasNextPage: bool,
  }),
  ApplicationInput: obj({ vacancyId: id, message: str({ minLength: 1, maxLength: 4000 }), disclose: fields }),
  Application: obj({
    id,
    candidateId: id,
    candidateAlias: str(),
    company: companyCard,
    vacancy: obj({ id, title: str(), specialization, grade, workMode, salary: ref('Salary'), description: str() }),
    message: str(),
    status: interactionStatus,
    createdAt: dt,
    viewedAt: nullable(dt),
    respondedAt: nullable(dt),
    disclosureFields: arr(en('name', 'email', 'sourceLinks'), { uniqueItems: true }),
    match: ref('Match'),
  }),
  Applications: obj({ items: arr(ref('Application')) }),
  TaskInput: obj({
    title: str({ minLength: 1, maxLength: 160 }),
    prompt: str({ minLength: 1, maxLength: 4000 }),
    skillId,
    grade,
    estimateMinutes: num({ minimum: 5, maximum: 120 }),
  }),
  Task: obj({
    id,
    title: str(),
    prompt: str(),
    skillId,
    grade,
    estimateMinutes: num({ minimum: 5, maximum: 120 }),
    status: en('active', 'archived'),
    createdAt: dt,
    responseCount: num({ minimum: 0 }),
  }),
  Tasks: obj({ items: arr(ref('Task')) }),
  OfferedTask: obj({
    id,
    company: obj({ id, displayName: str() }),
    title: str(),
    prompt: str(),
    skillId,
    grade,
    estimateMinutes: num({ minimum: 5, maximum: 120 }),
  }),
  TaskResponseInput: obj({ mode: en('solution', 'approach'), answer: str({ minLength: 1, maxLength: 10000 }) }),
  TaskResponse: obj({
    id,
    candidateId: id,
    candidateAlias: str(),
    task: ref('OfferedTask'),
    mode: en('solution', 'approach'),
    answer: str(),
    status: en('submitted', 'accepted', 'needs_work'),
    feedback: nullable(str()),
    submittedAt: dt,
    reviewedAt: nullable(dt),
  }),
  TaskResponses: obj({ items: arr(ref('TaskResponse')) }),
  TaskReviewInput: obj({ outcome: en('accepted', 'needs_work'), feedback: str({ maxLength: 2000 }) }),
  MyTasks: obj({
    period: obj({ from: dt, to: dt }),
    current: nullable(ref('OfferedTask')),
    currentResponse: nullable(ref('TaskResponse')),
    reason: nullable(en('assessment', 'processing_consent', 'no_tasks')),
    history: arr(ref('TaskResponse')),
    freshness: ref('Freshness'),
  }),
  AssessmentStartInput: obj({ specialization, grade }),
  AssessmentAnswer: obj({
    code: str({ maxLength: 100000 }),
    explanation: str({ maxLength: 20000 }),
    externalAiUsed: bool,
  }),
  Check: obj({ id, label: str(), status: en('passed', 'failed', 'not_run'), message: str() }),
  RubricCriterion: obj({ id, label: str(), weight: num({ minimum: 1 }) }),
  RubricOutcome: obj({ criterionId: id, label: str(), outcome: en('met', 'partial', 'not_met'), feedback: str() }),
  AssessmentTask: obj({
    id,
    family: str(),
    version: str({ minLength: 1, maxLength: 80 }),
    variantId: str(),
    title: str(),
    prompt: str(),
    language: en('rust'),
    starterCode: str(),
    acceptanceCriteria: arr(str()),
    rubric: arr(ref('RubricCriterion')),
    aiAllowed: { const: true, type: 'boolean' },
    externalAiAllowed: { const: true, type: 'boolean' },
    execution: en('simulated', 'sandboxed'),
  }),
  AssessmentResult: obj({
    assessmentId: id,
    outcome: en('passed', 'failed', 'service_error'),
    confirmedGrade: nullable(grade),
    previousGrade: nullable(grade),
    gradeChanged: bool,
    rubric: arr(ref('RubricOutcome')),
    checks: arr(ref('Check')),
    feedback: str(),
    nextEligibleAt: nullable(dt),
    simulation: bool,
  }),
  Assessment: obj({
    id,
    specialization,
    grade,
    status: en('draft', 'in_progress', 'submitted', 'evaluating', 'passed', 'failed', 'service_error'),
    task: ref('AssessmentTask'),
    answer: ref('AssessmentAnswer'),
    checks: arr(ref('Check')),
    result: nullable(ref('AssessmentResult')),
    createdAt: dt,
    updatedAt: dt,
    revision: num({ minimum: 1 }),
    simulation: bool,
  }),
  Assessments: obj({ items: arr(ref('Assessment')) }),
  AssistantInput: obj({ message: str({ minLength: 1, maxLength: 10000 }) }),
  AssistantReply: obj({
    message: str(),
    simulation: bool,
    aiAllowed: { const: true, type: 'boolean' },
    externalAiAllowed: { const: true, type: 'boolean' },
  }),
  Job: obj({
    id,
    kind: en('profile_import', 'source_sync', 'checks', 'assessment'),
    status: en('queued', 'running', 'succeeded', 'failed'),
    createdAt: dt,
    updatedAt: dt,
    result: nullable({
      oneOf: [
        obj({
          kind: en('profile_import'),
          preview: ref('ImportPreview'),
          parser: str({ minLength: 1, maxLength: 80 }),
          simulation: bool,
        }),
        obj({ kind: en('source_sync'), source: ref('Source') }),
        obj({ kind: en('checks'), assessmentId: id, checks: arr(ref('Check')), simulation: bool }),
        obj({ kind: en('assessment'), assessment: ref('Assessment') }),
      ],
    }),
    error: nullable(obj({ code: str(), message: str(), retryable: bool })),
    pollAfterMs: num({ minimum: 0 }),
    simulation: bool,
  }),
  MockSessionInput: obj({ actor: en('candidate024', 'candidate-new', 'employer-a', 'employer-b') }),
  MockResetInput: obj({
    scenario: en(
      'baseline',
      'qualified',
      'assessment_failure',
      'service_failure',
      'no_fsp',
      'empty_bank',
      'api_error',
      'new_candidate',
    ),
  }),
  MockReset: obj({ scenario: str(), clock: dt }),
  MockClockInput: obj({ advanceSeconds: num({ minimum: 0, maximum: 31536000 }) }),
  MockClock: obj({ clock: dt }),
  MockEmailCodes: obj({ items: arr(obj({ challengeId: id, email, code: str(), expiresAt: dt, used: bool })) }),
} satisfies Record<string, JsonSchema>;

export type SchemaName = keyof typeof schemas;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Auth = 'none' | 'any' | 'candidate' | 'employer';

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: JsonSchema;
}

interface RouteOptions {
  auth: Auth;
  body?: SchemaName;
  status?: 201 | 202 | 204;
  multipart?: true;
  pdf?: true;
  idempotent?: true;
  dev?: true;
  parameters?: readonly Parameter[];
}

const pathParam = (name: string): Parameter => ({ name, in: 'path', required: true, schema: id });
const query = (name: string, schema: JsonSchema, required = false): Parameter => ({
  name,
  in: 'query',
  required,
  schema,
});
const route = <const Id extends string, const Response extends SchemaName | null, const Options extends RouteOptions>(
  method: Method,
  path: string,
  operationId: Id,
  response: Response,
  options: Options,
) => ({ method, path, operationId, response, ...options });
export const routes = [
  route('get', '/health', 'getHealth', 'Health', { auth: 'none' }),
  route('get', '/api/v1/meta', 'getMeta', 'Meta', { auth: 'none' }),
  route('post', '/api/v1/auth/email/challenges', 'createEmailChallenge', 'EmailChallenge', {
    auth: 'none',
    body: 'EmailChallengeInput',
    status: 201,
  }),
  route('post', '/api/v1/auth/email/verify', 'verifyEmail', 'Session', { auth: 'none', body: 'EmailVerifyInput' }),
  route('delete', '/api/v1/auth/session', 'logout', null, { auth: 'none', status: 204 }),
  route('get', '/api/v1/session', 'getSession', 'Session', { auth: 'any' }),
  route('get', '/api/v1/me/profile', 'getMyProfile', 'Profile', { auth: 'candidate' }),
  route('patch', '/api/v1/me/profile', 'updateMyProfile', 'Profile', { auth: 'candidate', body: 'ProfilePatch' }),
  route('post', '/api/v1/me/profile/imports', 'importMyProfile', 'Job', {
    auth: 'candidate',
    multipart: true,
    status: 202,
  }),
  route('post', '/api/v1/me/profile/imports/{jobId}/confirm', 'confirmProfileImport', 'Profile', {
    auth: 'candidate',
    body: 'ImportConfirmInput',
  }),
  route('get', '/api/v1/me/profile/export', 'exportMyProfile', null, { auth: 'candidate', pdf: true }),
  route('get', '/api/v1/integrations/github/authorize', 'authorizeGitHub', 'GitHubAuthorization', {
    auth: 'candidate',
  }),
  route('get', '/api/v1/me/sources', 'getMySources', 'Sources', { auth: 'candidate' }),
  route('post', '/api/v1/me/sources/{provider}/connect', 'connectMySource', 'Source', {
    auth: 'candidate',
    body: 'SourceConnectInput',
  }),
  route('post', '/api/v1/me/sources/{sourceId}/sync', 'syncMySource', 'Job', { auth: 'candidate', status: 202 }),
  route('get', '/api/v1/me/skills', 'getMySkills', 'Skills', { auth: 'candidate' }),
  route('get', '/api/v1/me/graph', 'getMyGraph', 'Graph', { auth: 'candidate' }),
  route('get', '/api/v1/me/gap-plan', 'getMyGapPlan', 'GapPlan', {
    auth: 'candidate',
    parameters: [query('needId', id, true)],
  }),
  route('get', '/api/v1/me/assessments', 'listMyAssessments', 'Assessments', { auth: 'candidate' }),
  route('post', '/api/v1/me/assessments', 'startAssessment', 'Assessment', {
    auth: 'candidate',
    body: 'AssessmentStartInput',
    status: 201,
    idempotent: true,
  }),
  route('get', '/api/v1/me/assessments/{assessmentId}', 'getAssessment', 'Assessment', { auth: 'candidate' }),
  route('put', '/api/v1/me/assessments/{assessmentId}/answer', 'saveAssessmentAnswer', 'Assessment', {
    auth: 'candidate',
    body: 'AssessmentAnswer',
  }),
  route('post', '/api/v1/me/assessments/{assessmentId}/checks', 'runAssessmentChecks', 'Job', {
    auth: 'candidate',
    status: 202,
  }),
  route('post', '/api/v1/me/assessments/{assessmentId}/assistant', 'askAssessmentAssistant', 'AssistantReply', {
    auth: 'candidate',
    body: 'AssistantInput',
  }),
  route('post', '/api/v1/me/assessments/{assessmentId}/submit', 'submitAssessment', 'Job', {
    auth: 'candidate',
    status: 202,
    idempotent: true,
  }),
  route('get', '/api/v1/jobs/{jobId}', 'getJob', 'Job', { auth: 'any' }),
  route('get', '/api/v1/me/tasks', 'getMyTasks', 'MyTasks', { auth: 'candidate' }),
  route('post', '/api/v1/me/tasks/{taskId}/responses', 'respondToTask', 'TaskResponse', {
    auth: 'candidate',
    body: 'TaskResponseInput',
    status: 201,
    idempotent: true,
  }),
  route('get', '/api/v1/me/invitations', 'listMyInvitations', 'Invitations', { auth: 'candidate' }),
  route('get', '/api/v1/me/invitations/{invitationId}', 'getMyInvitation', 'Invitation', { auth: 'candidate' }),
  route('post', '/api/v1/me/invitations/{invitationId}/view', 'viewMyInvitation', 'Invitation', { auth: 'candidate' }),
  route('post', '/api/v1/me/invitations/{invitationId}/accept', 'acceptMyInvitation', 'Invitation', {
    auth: 'candidate',
    body: 'AcceptInvitationInput',
  }),
  route('post', '/api/v1/me/invitations/{invitationId}/decline', 'declineMyInvitation', 'Invitation', {
    auth: 'candidate',
  }),
  route('get', '/api/v1/vacancies', 'searchVacancies', 'VacancyPage', {
    auth: 'candidate',
    parameters: [
      query('specialization', specialization),
      query('grade', grade),
      query('workMode', workMode),
      query('skill', skillId),
      query('page', num({ minimum: 1, default: 1 })),
      query('pageSize', num({ minimum: 1, maximum: 50, default: 10 })),
    ],
  }),
  route('get', '/api/v1/vacancies/{vacancyId}', 'getVacancy', 'Vacancy', { auth: 'candidate' }),
  route('get', '/api/v1/me/applications', 'listMyApplications', 'Applications', { auth: 'candidate' }),
  route('post', '/api/v1/me/applications', 'createApplication', 'Application', {
    auth: 'candidate',
    body: 'ApplicationInput',
    status: 201,
    idempotent: true,
  }),
  route('get', '/api/v1/me/applications/{applicationId}', 'getMyApplication', 'Application', { auth: 'candidate' }),
  route('post', '/api/v1/me/applications/{applicationId}/withdraw', 'withdrawMyApplication', 'Application', {
    auth: 'candidate',
  }),
  route('get', '/api/v1/company', 'getCompany', 'Company', { auth: 'employer' }),
  route('patch', '/api/v1/company', 'updateCompany', 'Company', { auth: 'employer', body: 'CompanyPatch' }),
  route('get', '/api/v1/needs', 'listNeeds', 'Needs', { auth: 'employer' }),
  route('post', '/api/v1/needs', 'createNeed', 'Need', { auth: 'employer', body: 'NeedInput', status: 201 }),
  route('get', '/api/v1/needs/{needId}', 'getNeed', 'Need', { auth: 'employer' }),
  route('patch', '/api/v1/needs/{needId}', 'updateNeed', 'Need', { auth: 'employer', body: 'NeedPatch' }),
  route('delete', '/api/v1/needs/{needId}', 'deleteNeed', null, { auth: 'employer', status: 204 }),
  route('post', '/api/v1/needs/{needId}/publish', 'publishNeed', 'Need', { auth: 'employer' }),
  route('post', '/api/v1/needs/{needId}/unpublish', 'unpublishNeed', 'Need', { auth: 'employer' }),
  route('get', '/api/v1/needs/{needId}/graph', 'getNeedGraph', 'Graph', { auth: 'employer' }),
  route('get', '/api/v1/candidates', 'searchCandidates', 'CandidatePage', {
    auth: 'employer',
    parameters: [
      query('needId', id),
      query('mode', en('bank', 'recommended')),
      query('specialization', specialization),
      query('grade', grade),
      query('skill', skillId),
      query('fsp', en('any', 'verified')),
      query('page', num({ minimum: 1, default: 1 })),
      query('pageSize', num({ minimum: 1, maximum: 50, default: 10 })),
    ],
  }),
  route('get', '/api/v1/candidates/{candidateId}', 'getCandidate', 'AnonymousCandidate', {
    auth: 'employer',
    parameters: [query('needId', id)],
  }),
  route('get', '/api/v1/candidates/{candidateId}/graph', 'getCandidateGraph', 'Graph', { auth: 'employer' }),
  route('get', '/api/v1/candidates/{candidateId}/gap-plan', 'getCandidateGapPlan', 'GapPlan', {
    auth: 'employer',
    parameters: [query('needId', id, true)],
  }),
  route('get', '/api/v1/candidates/{candidateId}/disclosure', 'getCandidateDisclosure', 'Disclosure', {
    auth: 'employer',
  }),
  route('get', '/api/v1/shortlists', 'listShortlists', 'Shortlists', { auth: 'employer' }),
  route('post', '/api/v1/shortlists', 'createShortlist', 'Shortlist', {
    auth: 'employer',
    body: 'ShortlistInput',
    status: 201,
  }),
  route('get', '/api/v1/shortlists/{shortlistId}', 'getShortlist', 'Shortlist', { auth: 'employer' }),
  route('patch', '/api/v1/shortlists/{shortlistId}', 'updateShortlist', 'Shortlist', {
    auth: 'employer',
    body: 'ShortlistInput',
  }),
  route('delete', '/api/v1/shortlists/{shortlistId}', 'deleteShortlist', null, { auth: 'employer', status: 204 }),
  route('put', '/api/v1/shortlists/{shortlistId}/members/{candidateId}', 'addShortlistMember', 'Shortlist', {
    auth: 'employer',
  }),
  route('delete', '/api/v1/shortlists/{shortlistId}/members/{candidateId}', 'removeShortlistMember', 'Shortlist', {
    auth: 'employer',
  }),
  route('get', '/api/v1/invitations', 'listInvitations', 'Invitations', { auth: 'employer' }),
  route('post', '/api/v1/invitations', 'createInvitation', 'Invitation', {
    auth: 'employer',
    body: 'InvitationInput',
    status: 201,
    idempotent: true,
  }),
  route('get', '/api/v1/invitations/{invitationId}', 'getInvitation', 'Invitation', { auth: 'employer' }),
  route('post', '/api/v1/invitations/{invitationId}/withdraw', 'withdrawInvitation', 'Invitation', {
    auth: 'employer',
  }),
  route('get', '/api/v1/tasks', 'listTasks', 'Tasks', { auth: 'employer' }),
  route('post', '/api/v1/tasks', 'createTask', 'Task', { auth: 'employer', body: 'TaskInput', status: 201 }),
  route('post', '/api/v1/tasks/{taskId}/archive', 'archiveTask', 'Task', { auth: 'employer' }),
  route('get', '/api/v1/task-responses', 'listTaskResponses', 'TaskResponses', {
    auth: 'employer',
    parameters: [query('taskId', id)],
  }),
  route('post', '/api/v1/task-responses/{responseId}/review', 'reviewTaskResponse', 'TaskResponse', {
    auth: 'employer',
    body: 'TaskReviewInput',
  }),
  route('get', '/api/v1/applications', 'listApplications', 'Applications', {
    auth: 'employer',
    parameters: [query('needId', id)],
  }),
  route('get', '/api/v1/applications/{applicationId}', 'getApplication', 'Application', { auth: 'employer' }),
  route('post', '/api/v1/applications/{applicationId}/view', 'viewApplication', 'Application', { auth: 'employer' }),
  route('post', '/api/v1/applications/{applicationId}/accept', 'acceptApplication', 'Application', {
    auth: 'employer',
  }),
  route('post', '/api/v1/applications/{applicationId}/decline', 'declineApplication', 'Application', {
    auth: 'employer',
  }),
  route('post', '/__mock__/session', 'mockSelectSession', 'Session', {
    auth: 'none',
    dev: true,
    body: 'MockSessionInput',
  }),
  route('post', '/__mock__/reset', 'mockReset', 'MockReset', { auth: 'none', dev: true, body: 'MockResetInput' }),
  route('get', '/__mock__/email-codes', 'mockEmailCodes', 'MockEmailCodes', { auth: 'none', dev: true }),
  route('post', '/__mock__/clock', 'mockAdvanceClock', 'MockClock', {
    auth: 'none',
    dev: true,
    body: 'MockClockInput',
  }),
];

export type Route = (typeof routes)[number];
export type OperationId = Route['operationId'];
/** The route table with every option visible, for code that handles all routes alike. */
export type RouteDefinition = {
  method: Method;
  path: string;
  operationId: OperationId;
  response: SchemaName | null;
} & RouteOptions;
export const routeTable: readonly RouteDefinition[] = routes;

interface OperationObject {
  operationId: string;
  parameters?: Parameter[];
  [field: string]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Partial<Record<Method, OperationObject>>>;
  [field: string]: unknown;
}

export function buildOpenApi(): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  for (const entry of routeTable) {
    const parameters = [...(entry.parameters ?? [])];
    for (const match of entry.path.matchAll(/\{([^}]+)\}/g)) if (match[1]) parameters.push(pathParam(match[1]));
    if (entry.idempotent)
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: str({ minLength: 8, maxLength: 128 }),
      });
    const success = entry.status ?? 200;
    const responses: Record<string, JsonSchema> = {
      [success]: {
        description: entry.pdf ? 'Valid fixture PDF. Mock content is explicitly labelled.' : 'Success',
        ...(entry.pdf
          ? { content: { 'application/pdf': { schema: str({ format: 'binary' }) } } }
          : entry.response
            ? { content: { 'application/json': { schema: ref(entry.response) } } }
            : {}),
      },
    };
    for (const [status, description] of Object.entries(errorDescriptions)) {
      responses[status] = { description, content: { 'application/json': { schema: ref('Error') } } };
    }
    const operation: OperationObject = {
      operationId: entry.operationId,
      summary: entry.operationId,
      tags: [
        entry.dev
          ? 'Development only'
          : entry.auth === 'candidate'
            ? 'Candidate'
            : entry.auth === 'employer'
              ? 'Employer'
              : 'Shared',
      ],
      description: entry.dev
        ? 'Loopback-only development control. Exclude from the production backend and production frontend build.'
        : entry.idempotent
          ? 'Requires an Idempotency-Key. Repeating the same key and payload replays the stored response. A changed payload returns 409.'
          : 'Contract operation; implemented by the reference mock and by the Rust backend (coverage in docs/backend-implementation-checklist.md).',
      security: entry.auth === 'none' ? [] : [{ session: [] }],
      responses,
      ...(entry.dev ? { 'x-mock-only': true } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(entry.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: ref(entry.body) } } } }
        : {}),
      ...(entry.multipart
        ? {
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: obj({
                    file: str({
                      format: 'binary',
                      description:
                        'PDF, maximum 2 MiB. This mock validates the file signature and returns a labelled fixture preview; it does not extract the uploaded document.',
                    }),
                  }),
                },
              },
            },
          }
        : {}),
    };
    paths[entry.path] ??= {};
    (paths[entry.path] as Partial<Record<Method, OperationObject>>)[entry.method] = operation;
  }
  return {
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'FSP Career API',
      version: '0.1.0',
      description:
        'Platform contract. Implemented by the local stateful mock with synthetic data (the frontend development and behavior reference) and by the Rust backend in backend/ (operation coverage tracked in docs/backend-implementation-checklist.md). JSON responses use camelCase. Salary is integer RUB/month before tax. No production authentication, code execution, external provider, or real LLM is implemented.',
    },
    servers: [{ url: '/', description: 'Same origin; development Vite proxy forwards /api to 127.0.0.1:4010.' }],
    paths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'fsp_session',
          description: 'Opaque session cookie: HttpOnly, SameSite=Lax, Secure behind TLS.',
        },
      },
      schemas,
    },
  };
}

const errorDescriptions = {
  400: 'Malformed request or schema validation error',
  401: 'Missing or expired mock session',
  403: 'Role, consent, or origin restriction',
  404: 'Unknown resource or resource outside this actor/company',
  409: 'State, idempotency, or cooldown conflict',
  413: 'Request body exceeds limit',
  415: 'Unsupported media type',
  422: 'Valid shape but invalid domain values',
  429: 'Too many challenge attempts',
  500: 'Response conformance or unexpected server failure',
  503: 'Deterministic upstream error scenario',
} as const;
