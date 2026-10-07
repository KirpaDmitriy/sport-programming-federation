-- Production hardening over the initial schema.
--
-- 1. RFC3339 TEXT timestamps become real timestamptz columns: lexicographic
--    string comparison only held while every writer emitted the same spelling
--    ('+00:00' vs 'Z' order differently), and nothing enforced the convention.
-- 2. Foreign keys and CHECK constraints enforce what the service layer assumed.
-- 3. Partial unique indexes back the "one active invitation/application per
--    (company, candidate, need)", "one response per (candidate, task)" and
--    "one active assessment per candidate" rules the service checked
--    read-then-write.
-- 4. Indexes cover owner-scoped listings; idempotency_keys gains a running
--    state so concurrent same-key requests can serialize.
ALTER TABLE accounts
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
ALTER TABLE candidates
    ALTER COLUMN grade_confirmed_at TYPE timestamptz USING grade_confirmed_at::timestamptz,
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
ALTER TABLE challenges
    ALTER COLUMN expires_at TYPE timestamptz USING expires_at::timestamptz;
-- Challenges bind to (email, role) now: the account is only created on a
-- successful verification (lazy registration, same lifecycle as the mock).
ALTER TABLE challenges
    ADD COLUMN email TEXT,
    ADD COLUMN role TEXT,
    ALTER COLUMN account_id DROP NOT NULL;
UPDATE challenges c SET email = a.email, role = a.role FROM accounts a
    WHERE c.account_id = a.id;
DELETE FROM challenges WHERE email IS NULL;
ALTER TABLE challenges
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN role SET NOT NULL,
    DROP COLUMN account_id,
    ADD CONSTRAINT challenges_role_chk CHECK (role IN ('candidate', 'employer'));
ALTER TABLE sessions
    ALTER COLUMN expires_at TYPE timestamptz USING expires_at::timestamptz;
ALTER TABLE candidate_index
    ALTER COLUMN last_signal_at TYPE timestamptz USING last_signal_at::timestamptz;
ALTER TABLE needs
    ALTER COLUMN published_at TYPE timestamptz USING published_at::timestamptz,
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
ALTER TABLE oauth_states
    ALTER COLUMN expires_at TYPE timestamptz USING expires_at::timestamptz;
ALTER TABLE sources
    ALTER COLUMN last_synced_at TYPE timestamptz USING last_synced_at::timestamptz;
ALTER TABLE jobs
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
ALTER TABLE idempotency_keys
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
ALTER TABLE shortlists
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
ALTER TABLE invitations
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN viewed_at TYPE timestamptz USING viewed_at::timestamptz,
    ALTER COLUMN responded_at TYPE timestamptz USING responded_at::timestamptz;
ALTER TABLE disclosures
    ALTER COLUMN granted_at TYPE timestamptz USING granted_at::timestamptz;
ALTER TABLE applications
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN viewed_at TYPE timestamptz USING viewed_at::timestamptz,
    ALTER COLUMN responded_at TYPE timestamptz USING responded_at::timestamptz;
ALTER TABLE tasks
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
ALTER TABLE task_responses
    ALTER COLUMN submitted_at TYPE timestamptz USING submitted_at::timestamptz,
    ALTER COLUMN reviewed_at TYPE timestamptz USING reviewed_at::timestamptz;
ALTER TABLE assessments
    ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz,
    ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;

-- Referential integrity. NOT VALID keeps pre-existing rows untouched while
-- enforcing every future write; VALIDATE can run later once audited.
ALTER TABLE accounts
    ADD CONSTRAINT accounts_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID,
    ADD CONSTRAINT accounts_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID,
    ADD CONSTRAINT accounts_one_identity CHECK ((candidate_id IS NOT NULL) <> (company_id IS NOT NULL));
ALTER TABLE oauth_states
    ADD CONSTRAINT oauth_states_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE github_credentials
    ADD CONSTRAINT github_credentials_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE sources
    ADD CONSTRAINT sources_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE jobs
    ADD CONSTRAINT jobs_owner_fk FOREIGN KEY (owner_id) REFERENCES accounts(id) NOT VALID,
    ADD CONSTRAINT jobs_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID,
    ADD CONSTRAINT jobs_assessment_fk FOREIGN KEY (assessment_id) REFERENCES assessments(id) NOT VALID,
    ADD CONSTRAINT jobs_result_source_fk FOREIGN KEY (result_source_id) REFERENCES sources(id) NOT VALID;
ALTER TABLE invitations
    ADD CONSTRAINT invitations_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID,
    ADD CONSTRAINT invitations_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE applications
    ADD CONSTRAINT applications_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID,
    ADD CONSTRAINT applications_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE task_responses
    ADD CONSTRAINT task_responses_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID,
    ADD CONSTRAINT task_responses_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE assessments
    ADD CONSTRAINT assessments_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID;
ALTER TABLE disclosures
    ADD CONSTRAINT disclosures_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID,
    ADD CONSTRAINT disclosures_candidate_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) NOT VALID,
    ADD CONSTRAINT disclosures_invitation_fk FOREIGN KEY (invitation_id) REFERENCES invitations(id) NOT VALID,
    ADD CONSTRAINT disclosures_application_fk FOREIGN KEY (application_id) REFERENCES applications(id) NOT VALID;

-- Duplicate-guard columns: the interaction payloads freeze the need inside
-- JSON, so expose it as a column for a real uniqueness constraint.
ALTER TABLE invitations ADD COLUMN need_id TEXT;
ALTER TABLE applications ADD COLUMN need_id TEXT;
ALTER TABLE task_responses ADD COLUMN task_id TEXT;
UPDATE invitations SET need_id = need_json::jsonb ->> 'id';
UPDATE applications SET need_id = vacancy_json::jsonb ->> 'id';
UPDATE task_responses SET task_id = task_json::jsonb ->> 'id';
ALTER TABLE invitations ALTER COLUMN need_id SET NOT NULL;
ALTER TABLE applications ALTER COLUMN need_id SET NOT NULL;
ALTER TABLE task_responses ALTER COLUMN task_id SET NOT NULL;

CREATE UNIQUE INDEX uq_invitations_active
    ON invitations(company_id, candidate_id, need_id) WHERE status IN ('sent', 'viewed');
CREATE UNIQUE INDEX uq_applications_active
    ON applications(company_id, candidate_id, need_id) WHERE status IN ('sent', 'viewed');
CREATE UNIQUE INDEX uq_task_responses_once ON task_responses(candidate_id, task_id);
ALTER TABLE assessments ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX uq_assessments_active ON assessments(candidate_id)
    WHERE status IN ('draft', 'in_progress', 'submitted', 'evaluating');

-- Enum vocabularies the domain parses must round-trip; CHECKs make corruption loud.
ALTER TABLE accounts ADD CONSTRAINT accounts_role_chk CHECK (role IN ('candidate', 'employer'));
ALTER TABLE invitations ADD CONSTRAINT invitations_status_chk
    CHECK (status IN ('sent', 'viewed', 'accepted', 'declined', 'withdrawn'));
ALTER TABLE applications ADD CONSTRAINT applications_status_chk
    CHECK (status IN ('sent', 'viewed', 'accepted', 'declined', 'withdrawn'));
ALTER TABLE tasks ADD CONSTRAINT tasks_status_chk CHECK (status IN ('active', 'archived'));
ALTER TABLE task_responses
    ADD CONSTRAINT task_responses_status_chk CHECK (status IN ('submitted', 'accepted', 'needs_work')),
    ADD CONSTRAINT task_responses_mode_chk CHECK (mode IN ('solution', 'approach'));
ALTER TABLE assessments ADD CONSTRAINT assessments_status_chk CHECK (
    status IN ('draft', 'in_progress', 'submitted', 'evaluating', 'passed', 'failed', 'service_error'));
ALTER TABLE needs ADD CONSTRAINT needs_work_mode_chk
    CHECK (work_mode IN ('remote', 'hybrid', 'office'));
ALTER TABLE sources ADD CONSTRAINT sources_provider_chk CHECK (provider IN ('github', 'fsp'));
ALTER TABLE jobs ADD CONSTRAINT jobs_status_chk CHECK (status IN ('running', 'succeeded', 'failed'));

-- One account per candidate/company, emails unique case-insensitively.
CREATE UNIQUE INDEX uq_accounts_candidate ON accounts(candidate_id) WHERE candidate_id IS NOT NULL;
CREATE UNIQUE INDEX uq_accounts_company ON accounts(company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX uq_accounts_email_ci ON accounts(lower(email));

-- Coverage for the actual query patterns: owner-scoped lists ordered by seq or
-- created_at, expiry sweeps, the account->candidate lookup used per row.
CREATE INDEX idx_accounts_candidate ON accounts(candidate_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX idx_challenges_email_expiry ON challenges(email, expires_at);
CREATE INDEX idx_needs_company_created ON needs(company_id, created_at, id);
CREATE INDEX idx_invitations_company_seq ON invitations(company_id, seq);
CREATE INDEX idx_applications_company_seq ON applications(company_id, seq);
CREATE INDEX idx_tasks_company_created ON tasks(company_id, created_at, id);
CREATE INDEX idx_task_responses_company_seq ON task_responses(company_id, seq);
CREATE INDEX idx_assessments_candidate_seq ON assessments(candidate_id, seq DESC);
CREATE INDEX idx_jobs_owner ON jobs(owner_id);
DROP INDEX idx_sessions_account;

-- Idempotency claims: 'running' marks a scope whose command is still executing;
-- 'done' rows carry the replayable response.
ALTER TABLE idempotency_keys ADD COLUMN state TEXT NOT NULL DEFAULT 'done';
ALTER TABLE idempotency_keys ALTER COLUMN fingerprint DROP NOT NULL;
ALTER TABLE idempotency_keys ALTER COLUMN status DROP NOT NULL;
ALTER TABLE idempotency_keys ALTER COLUMN body_json DROP NOT NULL;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_state_chk CHECK (state IN ('running', 'done'));
