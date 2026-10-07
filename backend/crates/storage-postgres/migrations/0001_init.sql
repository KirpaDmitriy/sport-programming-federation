-- Initial schema: same tables and keys the SQLite adapter used, with native
-- booleans, BIGINT for unsigned counters and identity columns where the old
-- storage relied on rowid ordering.
CREATE TABLE accounts(
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    candidate_id TEXT,
    company_id TEXT,
    email_verified BOOLEAN NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE candidates(
    id TEXT PRIMARY KEY,
    alias TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    specialization TEXT NOT NULL,
    selected_grade TEXT NOT NULL,
    stack_json TEXT NOT NULL,
    team_role TEXT NOT NULL,
    experience_months INTEGER,
    experience TEXT NOT NULL,
    soft_skills_json TEXT NOT NULL,
    processing_consent BOOLEAN NOT NULL,
    publication_consent BOOLEAN NOT NULL,
    verified_grade TEXT,
    verified_specialization TEXT,
    grade_confirmed_at TEXT,
    revision BIGINT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE companies(
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    business_area TEXT NOT NULL,
    description TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    website TEXT
);
CREATE TABLE challenges(
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    used BOOLEAN NOT NULL
);
CREATE TABLE sessions(
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    expires_at TEXT NOT NULL
);
CREATE TABLE candidate_index(
    candidate_id TEXT PRIMARY KEY REFERENCES candidates(id),
    work_modes_json TEXT NOT NULL,
    available_for_offers BOOLEAN NOT NULL,
    skills_json TEXT NOT NULL,
    source_kinds_json TEXT NOT NULL,
    fsp_verified BOOLEAN NOT NULL,
    last_signal_at TEXT
);
CREATE TABLE needs(
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL,
    specialization TEXT NOT NULL,
    grade TEXT NOT NULL,
    work_mode TEXT NOT NULL,
    salary_from BIGINT NOT NULL,
    salary_to BIGINT NOT NULL,
    description TEXT NOT NULL,
    requirements_json TEXT NOT NULL,
    published BOOLEAN NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision BIGINT NOT NULL
);
CREATE TABLE oauth_states(
    state TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used BOOLEAN NOT NULL
);
CREATE TABLE github_credentials(
    candidate_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL
);
CREATE TABLE sources(
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    synthetic BOOLEAN NOT NULL,
    active_job_id TEXT,
    account_label TEXT,
    last_synced_at TEXT,
    analysis_json TEXT,
    verified_participation BOOLEAN NOT NULL,
    competition_ids_json TEXT NOT NULL
);
CREATE TABLE jobs(
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'source_sync',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    candidate_id TEXT,
    assessment_id TEXT,
    input_revision BIGINT,
    result_json TEXT,
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    result_source_id TEXT,
    error_code TEXT,
    error_message TEXT
);
CREATE TABLE idempotency_keys(
    scope TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    status INTEGER NOT NULL,
    body_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
-- seq replaces the SQLite rowid ordering guarantees for creation-order reads.
CREATE TABLE shortlists(
    id TEXT PRIMARY KEY,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL,
    members_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE invitations(
    id TEXT PRIMARY KEY,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    company_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    candidate_alias TEXT NOT NULL,
    company_json TEXT NOT NULL,
    need_json TEXT NOT NULL,
    need_definition_json TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    viewed_at TEXT,
    responded_at TEXT,
    disclosure_json TEXT NOT NULL
);
CREATE TABLE disclosures(
    company_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    invitation_id TEXT,
    application_id TEXT,
    granted_at TEXT NOT NULL,
    name TEXT,
    email TEXT,
    source_links_json TEXT NOT NULL,
    PRIMARY KEY(company_id, candidate_id)
);
CREATE TABLE applications(
    id TEXT PRIMARY KEY,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    company_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    candidate_alias TEXT NOT NULL,
    company_json TEXT NOT NULL,
    vacancy_json TEXT NOT NULL,
    need_definition_json TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    viewed_at TEXT,
    responded_at TEXT,
    disclosure_json TEXT NOT NULL
);
CREATE TABLE tasks(
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    estimate_minutes INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE task_responses(
    id TEXT PRIMARY KEY,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    candidate_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    candidate_alias TEXT NOT NULL,
    task_json TEXT NOT NULL,
    mode TEXT NOT NULL,
    answer TEXT NOT NULL,
    status TEXT NOT NULL,
    feedback TEXT,
    submitted_at TEXT NOT NULL,
    reviewed_at TEXT
);
CREATE TABLE assessments(
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    specialization TEXT NOT NULL,
    grade TEXT NOT NULL,
    status TEXT NOT NULL,
    task_json TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    checks_json TEXT NOT NULL,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision BIGINT NOT NULL
);
CREATE INDEX idx_needs_company ON needs(company_id);
CREATE INDEX idx_needs_published ON needs(published) WHERE published;
CREATE INDEX idx_invitations_company ON invitations(company_id);
CREATE INDEX idx_invitations_candidate ON invitations(candidate_id);
CREATE INDEX idx_applications_company ON applications(company_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_tasks_company ON tasks(company_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_task_responses_candidate ON task_responses(candidate_id);
CREATE INDEX idx_task_responses_company ON task_responses(company_id);
CREATE INDEX idx_assessments_candidate ON assessments(candidate_id);
CREATE INDEX idx_sources_candidate ON sources(candidate_id);
CREATE INDEX idx_sessions_account ON sessions(account_id);
