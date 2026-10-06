use std::path::Path;
use std::sync::Mutex;

use fsp_application::{
    ConsumeChallenge, PendingChallenge, PlatformRepository, RepositoryError,
    StoredIdempotentResponse,
};
use fsp_domain::{
    Account, CandidateIndexRecord, CandidateProfile, Company, Consents, Criticality,
    EvidencePolicy, EvidenceSource, EvidenceStatus, Grade, HiringNeed, HiringNeedRecord, JobRecord,
    Requirement, Role, SkillEvidence, SourceProvider, SourceRecord, Specialization,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::de::DeserializeOwned;

pub struct SqliteRepository {
    connection: Mutex<Connection>,
}

impl SqliteRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, RepositoryError> {
        let connection = Connection::open(path).map_err(storage)?;
        connection.execute_batch(SCHEMA).map_err(storage)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, RepositoryError> {
        self.connection
            .lock()
            .map_err(|_| RepositoryError::Storage("database lock poisoned".into()))
    }
}

impl PlatformRepository for SqliteRepository {
    fn account_by_email(&self, email: &str) -> Result<Option<Account>, RepositoryError> {
        self.connection()?
            .query_row(ACCOUNT_BY_EMAIL, [email], account)
            .optional()
            .map_err(storage)
    }

    fn account_by_id(&self, id: &str) -> Result<Option<Account>, RepositoryError> {
        self.connection()?
            .query_row(ACCOUNT_BY_ID, [id], account)
            .optional()
            .map_err(storage)
    }

    fn create_account(&self, value: &Account, now: &str) -> Result<(), RepositoryError> {
        self.connection()?.execute(
            "INSERT INTO accounts(id,email,role,candidate_id,company_id,email_verified,created_at) VALUES(?,?,?,?,?,?,?)",
            params![value.id, value.email, role(value.role), value.candidate_id, value.company_id, value.email_verified, now],
        ).map_err(conflict)?;
        Ok(())
    }

    fn create_candidate(&self, value: &CandidateProfile) -> Result<(), RepositoryError> {
        let connection = self.connection()?;
        save_candidate(&connection, value, true)
    }

    fn create_company(&self, value: &Company) -> Result<(), RepositoryError> {
        self.connection()?.execute(
            "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES(?,?,?,?,?,?)",
            params![value.id, value.display_name, value.business_area, value.description, value.contact_email, value.website],
        ).map_err(conflict)?;
        Ok(())
    }

    fn save_challenge(&self, value: &PendingChallenge) -> Result<(), RepositoryError> {
        self.connection()?.execute(
            "INSERT INTO challenges(id,account_id,code_hash,expires_at,attempts,used) VALUES(?,?,?,?,?,?)",
            params![value.id, value.account_id, value.code_hash, value.expires_at, value.attempts, value.used],
        ).map_err(storage)?;
        Ok(())
    }

    fn consume_challenge(
        &self,
        id: &str,
        code_hash: &str,
        now: &str,
    ) -> Result<(ConsumeChallenge, Option<Account>), RepositoryError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(storage)?;
        let challenge = transaction
            .query_row(
                "SELECT account_id,code_hash,expires_at,attempts,used FROM challenges WHERE id=?",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, u8>(3)?,
                        row.get::<_, bool>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(storage)?;
        let Some((account_id, expected, expires_at, attempts, used)) = challenge else {
            return Ok((ConsumeChallenge::Missing, None));
        };
        // The mock checks expiry before consumption so a stale code reports expired.
        if expires_at.as_str() <= now {
            return Ok((ConsumeChallenge::Expired, None));
        }
        if used {
            return Ok((ConsumeChallenge::Used, None));
        }
        if attempts >= 5 {
            return Ok((ConsumeChallenge::Locked, None));
        }
        if expected != code_hash {
            transaction
                .execute("UPDATE challenges SET attempts=attempts+1 WHERE id=?", [id])
                .map_err(storage)?;
            transaction.commit().map_err(storage)?;
            return Ok((
                if attempts + 1 >= 5 {
                    ConsumeChallenge::Locked
                } else {
                    ConsumeChallenge::WrongCode
                },
                None,
            ));
        }
        transaction
            .execute("UPDATE challenges SET used=1 WHERE id=?", [id])
            .map_err(storage)?;
        transaction
            .execute(
                "UPDATE accounts SET email_verified=1 WHERE id=?",
                [&account_id],
            )
            .map_err(storage)?;
        let account = transaction
            .query_row(ACCOUNT_BY_ID, [&account_id], account)
            .optional()
            .map_err(storage)?;
        transaction.commit().map_err(storage)?;
        Ok((ConsumeChallenge::Consumed, account))
    }

    fn create_session(
        &self,
        token_hash: &str,
        account_id: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)",
                params![token_hash, account_id, expires_at],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn account_for_session(
        &self,
        token_hash: &str,
        now: &str,
    ) -> Result<Option<Account>, RepositoryError> {
        self.connection()?.query_row(
            "SELECT a.id,a.email,a.role,a.candidate_id,a.company_id,a.email_verified FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?",
            params![token_hash,now], account,
        ).optional().map_err(storage)
    }

    fn delete_session(&self, token_hash: &str) -> Result<(), RepositoryError> {
        self.connection()?
            .execute("DELETE FROM sessions WHERE token_hash=?", [token_hash])
            .map_err(storage)?;
        Ok(())
    }

    fn candidate(&self, id: &str) -> Result<Option<CandidateProfile>, RepositoryError> {
        self.connection()?.query_row("SELECT id,alias,email,name,specialization,selected_grade,stack_json,team_role,experience_months,experience,soft_skills_json,processing_consent,publication_consent,verified_grade,verified_specialization,grade_confirmed_at,revision,updated_at FROM candidates WHERE id=?", [id], candidate).optional().map_err(storage)
    }

    fn save_candidate(&self, value: &CandidateProfile) -> Result<(), RepositoryError> {
        let connection = self.connection()?;
        save_candidate(&connection, value, false)
    }

    fn company(&self, id: &str) -> Result<Option<Company>, RepositoryError> {
        self.connection()?.query_row("SELECT id,display_name,business_area,description,contact_email,website FROM companies WHERE id=?", [id], |row| Ok(Company { id: row.get(0)?, display_name: row.get(1)?, business_area: row.get(2)?, description: row.get(3)?, contact_email: row.get(4)?, website: row.get(5)? })).optional().map_err(storage)
    }

    fn save_company(&self, value: &Company) -> Result<(), RepositoryError> {
        self.connection()?.execute("UPDATE companies SET display_name=?,business_area=?,description=?,contact_email=?,website=? WHERE id=?", params![value.display_name,value.business_area,value.description,value.contact_email,value.website,value.id]).map_err(storage)?;
        Ok(())
    }

    fn candidates(&self) -> Result<Vec<CandidateIndexRecord>, RepositoryError> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT id,alias,email,name,specialization,selected_grade,stack_json,team_role,experience_months,experience,soft_skills_json,processing_consent,publication_consent,verified_grade,verified_specialization,grade_confirmed_at,revision,updated_at FROM candidates")
            .map_err(storage)?;
        let profiles = statement
            .query_map([], candidate)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)?;
        profiles
            .into_iter()
            .map(|profile| candidate_index(&connection, profile))
            .collect()
    }

    fn needs(&self, company_id: &str) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(NEED_SELECT).map_err(storage)?;
        statement
            .query_map([company_id], need_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn need(
        &self,
        company_id: &str,
        need_id: &str,
    ) -> Result<Option<HiringNeedRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                &format!("{NEED_SELECT} AND id=?"),
                params![company_id, need_id],
                need_record,
            )
            .optional()
            .map_err(storage)
    }

    fn save_need(&self, value: &HiringNeedRecord) -> Result<(), RepositoryError> {
        let requirements = serde_json::to_string(&value.need.requirements).map_err(json_storage)?;
        self.connection()?
            .execute(
                "INSERT OR REPLACE INTO needs(id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                params![
                    value.id,
                    value.company_id,
                    value.title,
                    specialization(value.need.specialization),
                    grade(value.need.grade),
                    value.work_mode,
                    value.salary_from,
                    value.salary_to,
                    value.description,
                    requirements,
                    value.published,
                    value.published_at,
                    value.created_at,
                    value.updated_at,
                    value.revision
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn delete_need(&self, company_id: &str, need_id: &str) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "DELETE FROM needs WHERE id=? AND company_id=?",
                params![need_id, company_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn published_needs(&self) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare("SELECT id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision FROM needs WHERE published=1")
            .map_err(storage)?
            .query_map([], need_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn shortlists(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ShortlistRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare(
                "SELECT id,company_id,title,members_json,created_at,updated_at FROM shortlists WHERE company_id=? ORDER BY rowid",
            )
            .map_err(storage)?
            .query_map([company_id], shortlist_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn shortlist(
        &self,
        company_id: &str,
        shortlist_id: &str,
    ) -> Result<Option<fsp_domain::ShortlistRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT id,company_id,title,members_json,created_at,updated_at FROM shortlists WHERE company_id=? AND id=?",
                params![company_id, shortlist_id],
                shortlist_record,
            )
            .optional()
            .map_err(storage)
    }

    fn save_shortlist(&self, value: &fsp_domain::ShortlistRecord) -> Result<(), RepositoryError> {
        let members = serde_json::to_string(&value.member_ids).map_err(json_storage)?;
        self.connection()?
            .execute(
                "INSERT OR REPLACE INTO shortlists(id,company_id,title,members_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                params![
                    value.id,
                    value.company_id,
                    value.title,
                    members,
                    value.created_at,
                    value.updated_at
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn delete_shortlist(
        &self,
        company_id: &str,
        shortlist_id: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "DELETE FROM shortlists WHERE id=? AND company_id=?",
                params![shortlist_id, company_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn invitations(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare("SELECT * FROM invitations WHERE company_id=? ORDER BY rowid")
            .map_err(storage)?
            .query_map([company_id], invitation_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn candidate_invitations(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare("SELECT * FROM invitations WHERE candidate_id=? ORDER BY rowid")
            .map_err(storage)?
            .query_map([candidate_id], invitation_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn invitation(
        &self,
        invitation_id: &str,
    ) -> Result<Option<fsp_domain::InvitationRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT * FROM invitations WHERE id=?",
                params![invitation_id],
                invitation_record,
            )
            .optional()
            .map_err(storage)
    }

    fn save_invitation(&self, value: &fsp_domain::InvitationRecord) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT OR REPLACE INTO invitations(id,company_id,candidate_id,candidate_alias,company_json,need_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                params![
                    value.id,
                    value.company_id,
                    value.candidate_id,
                    value.candidate_alias,
                    serde_json::to_string(&value.company).map_err(json_storage)?,
                    serde_json::to_string(&value.need).map_err(json_storage)?,
                    serde_json::to_string(&value.need_definition).map_err(json_storage)?,
                    value.message,
                    value.status.as_str(),
                    value.created_at,
                    value.viewed_at,
                    value.responded_at,
                    serde_json::to_string(&value.disclosure_fields).map_err(json_storage)?,
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<Option<fsp_domain::DisclosureRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT candidate_id,company_id,invitation_id,application_id,granted_at,name,email,source_links_json FROM disclosures WHERE company_id=? AND candidate_id=?",
                params![company_id, candidate_id],
                disclosure_record,
            )
            .optional()
            .map_err(storage)
    }

    fn save_disclosure(&self, value: &fsp_domain::DisclosureRecord) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT OR REPLACE INTO disclosures(company_id,candidate_id,invitation_id,application_id,granted_at,name,email,source_links_json) VALUES(?,?,?,?,?,?,?,?)",
                params![
                    value.company_id,
                    value.candidate_id,
                    value.invitation_id,
                    value.application_id,
                    value.granted_at,
                    value.name,
                    value.email,
                    serde_json::to_string(&value.source_links).map_err(json_storage)?,
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn delete_disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "DELETE FROM disclosures WHERE company_id=? AND candidate_id=?",
                params![company_id, candidate_id],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn company_applications(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare("SELECT * FROM applications WHERE company_id=?")
            .map_err(storage)?
            .query_map([company_id], application_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn candidate_applications(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError> {
        let connection = self.connection()?;
        connection
            .prepare("SELECT * FROM applications WHERE candidate_id=?")
            .map_err(storage)?
            .query_map([candidate_id], application_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn application(
        &self,
        application_id: &str,
    ) -> Result<Option<fsp_domain::ApplicationRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT * FROM applications WHERE id=?",
                params![application_id],
                application_record,
            )
            .optional()
            .map_err(storage)
    }

    fn save_application(
        &self,
        value: &fsp_domain::ApplicationRecord,
    ) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT OR REPLACE INTO applications(id,company_id,candidate_id,candidate_alias,company_json,vacancy_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                params![
                    value.id,
                    value.company_id,
                    value.candidate_id,
                    value.candidate_alias,
                    serde_json::to_string(&value.company).map_err(json_storage)?,
                    serde_json::to_string(&value.vacancy).map_err(json_storage)?,
                    serde_json::to_string(&value.need_definition).map_err(json_storage)?,
                    value.message,
                    value.status.as_str(),
                    value.created_at,
                    value.viewed_at,
                    value.responded_at,
                    serde_json::to_string(&value.disclosure_fields).map_err(json_storage)?,
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn save_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO oauth_states(state,candidate_id,expires_at,used) VALUES(?,?,?,0)",
                params![state, candidate_id, expires_at],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn consume_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        now: &str,
    ) -> Result<bool, RepositoryError> {
        let connection = self.connection()?;
        let changed = connection
            .execute(
                "UPDATE oauth_states SET used=1 WHERE state=? AND candidate_id=? AND expires_at>? AND used=0",
                params![state, candidate_id, now],
            )
            .map_err(storage)?;
        Ok(changed == 1)
    }

    fn save_github_token(&self, candidate_id: &str, token: &str) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO github_credentials(candidate_id,access_token) VALUES(?,?) ON CONFLICT(candidate_id) DO UPDATE SET access_token=excluded.access_token",
                params![candidate_id, token],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn github_token(&self, candidate_id: &str) -> Result<Option<String>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT access_token FROM github_credentials WHERE candidate_id=?",
                [candidate_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage)
    }

    fn sources(&self, candidate_id: &str) -> Result<Vec<SourceRecord>, RepositoryError> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT id,candidate_id,provider,synthetic,active_job_id,account_label,last_synced_at,analysis_json,verified_participation,competition_ids_json FROM sources WHERE candidate_id=?")
            .map_err(storage)?;
        statement
            .query_map([candidate_id], source_record)
            .map_err(storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage)
    }

    fn save_source(&self, source: &SourceRecord) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO sources(id,candidate_id,provider,synthetic,active_job_id,account_label,last_synced_at,analysis_json,verified_participation,competition_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active_job_id=excluded.active_job_id,account_label=excluded.account_label,last_synced_at=excluded.last_synced_at,analysis_json=excluded.analysis_json,verified_participation=excluded.verified_participation,competition_ids_json=excluded.competition_ids_json",
                params![
                    source.id,
                    source.candidate_id,
                    source_provider(source.provider),
                    source.synthetic,
                    source.active_job_id,
                    source.account_label,
                    source.last_synced_at,
                    source.analysis.as_ref().map(serde_json::to_string).transpose().map_err(json_storage)?,
                    source.verified_participation,
                    serde_json::to_string(&source.competition_ids).map_err(json_storage)?
                ],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn save_job(&self, job: &JobRecord) -> Result<(), RepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO jobs(id,owner_id,status,created_at,updated_at,result_source_id,error_code,error_message) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,result_source_id=excluded.result_source_id,error_code=excluded.error_code,error_message=excluded.error_message",
                params![job.id,job.owner_id,job.status,job.created_at,job.updated_at,job.result_source_id,job.error_code,job.error_message],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn job(&self, owner_id: &str, job_id: &str) -> Result<Option<JobRecord>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT id,owner_id,status,created_at,updated_at,result_source_id,error_code,error_message FROM jobs WHERE owner_id=? AND id=?",
                params![owner_id, job_id],
                |row| Ok(JobRecord { id: row.get(0)?, owner_id: row.get(1)?, status: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)?, result_source_id: row.get(5)?, error_code: row.get(6)?, error_message: row.get(7)? }),
            )
            .optional()
            .map_err(storage)
    }

    fn idempotency_get(
        &self,
        scope: &str,
    ) -> Result<Option<StoredIdempotentResponse>, RepositoryError> {
        self.connection()?
            .query_row(
                "SELECT fingerprint,status,body_json FROM idempotency_keys WHERE scope=?",
                [scope],
                |row| {
                    Ok(StoredIdempotentResponse {
                        fingerprint: row.get(0)?,
                        status: row.get(1)?,
                        body: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(storage)
    }

    fn idempotency_put(
        &self,
        scope: &str,
        fingerprint: &str,
        status: u16,
        body: &str,
        now: &str,
    ) -> Result<(), RepositoryError> {
        // INSERT OR IGNORE keeps the first response when retries race.
        self.connection()?
            .execute(
                "INSERT OR IGNORE INTO idempotency_keys(scope,fingerprint,status,body_json,created_at) VALUES(?,?,?,?,?)",
                params![scope, fingerprint, i64::from(status), body, now],
            )
            .map_err(storage)?;
        Ok(())
    }

    fn seed_demo(&self, now: &str) -> Result<(), RepositoryError> {
        let connection = self.connection()?;
        if connection
            .query_row("SELECT EXISTS(SELECT 1 FROM accounts)", [], |row| {
                row.get::<_, bool>(0)
            })
            .map_err(storage)?
        {
            return Ok(());
        }
        seed(&connection, now)
    }
}

fn seed(connection: &Connection, now: &str) -> Result<(), RepositoryError> {
    let candidate = Account {
        id: "candidate024".into(),
        email: "alexey@example.com".into(),
        role: Role::Candidate,
        candidate_id: Some("candidate-024".into()),
        company_id: None,
        email_verified: true,
    };
    let employer = Account {
        id: "employer-a".into(),
        email: "hr@sever-tech.example".into(),
        role: Role::Employer,
        candidate_id: None,
        company_id: Some("company-sever".into()),
        email_verified: true,
    };
    for account_value in [&candidate, &employer] {
        connection.execute("INSERT INTO accounts(id,email,role,candidate_id,company_id,email_verified,created_at) VALUES(?,?,?,?,?,?,?)", params![account_value.id,account_value.email,role(account_value.role),account_value.candidate_id,account_value.company_id,account_value.email_verified,now]).map_err(storage)?;
    }
    save_candidate(
        connection,
        &CandidateProfile {
            id: "candidate-024".into(),
            alias: "Кандидат №024".into(),
            email: candidate.email,
            name: "Алексей Морозов".into(),
            specialization: Specialization::Backend,
            selected_grade: Grade::Middle,
            stack: vec!["rust".into(), "postgresql".into(), "docker".into()],
            team_role: "Backend-разработчик".into(),
            experience_months: Some(30),
            experience: "Разрабатывает надёжные API и фоновые обработчики.".into(),
            soft_skills: vec!["Командная работа".into()],
            consents: Consents {
                processing: true,
                publication: true,
            },
            verified_grade: Some(Grade::Junior),
            verified_specialization: Some(Specialization::Backend),
            grade_confirmed_at: Some("2026-06-01T12:00:00Z".into()),
            revision: 1,
            updated_at: now.into(),
        },
        true,
    )?;
    for profile in demo_candidates(now) {
        // Demo candidates are pre-verified fixtures: give each one a verified
        // account so employer visibility checks see the same state as the mock.
        connection.execute("INSERT INTO accounts(id,email,role,candidate_id,company_id,email_verified,created_at) VALUES(?,?,?,?,?,?,?)", params![format!("account-{}", profile.id),profile.email,role(Role::Candidate),profile.id,Option::<String>::None,true,now]).map_err(storage)?;
        save_candidate(connection, &profile, true)?;
    }
    for (id, skills, sources, fsp_verified) in demo_candidate_indexes() {
        connection
            .execute(
                "INSERT INTO candidate_index(candidate_id,work_modes_json,available_for_offers,skills_json,source_kinds_json,fsp_verified,last_signal_at) VALUES(?,?,?,?,?,?,?)",
                params![
                    id,
                    "[\"remote\",\"hybrid\"]",
                    true,
                    serde_json::to_string(&skills).map_err(json_storage)?,
                    serde_json::to_string(&sources).map_err(json_storage)?,
                    fsp_verified,
                    now
                ],
            )
            .map_err(storage)?;
    }
    connection
        .execute(
            "INSERT INTO sources(id,candidate_id,provider,synthetic,active_job_id,account_label,last_synced_at,analysis_json,verified_participation,competition_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
            params![
                "source-fsp-candidate-024",
                "candidate-024",
                "fsp",
                true,
                Option::<String>::None,
                "fsp-demo-024",
                now,
                Option::<String>::None,
                true,
                "[\"competition-demo-api\"]"
            ],
        )
        .map_err(storage)?;
    connection.execute("INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES(?,?,?,?,?,?)", params!["company-sever","Север Тех","Разработка ИТ-продуктов","Команда продуктовой разработки надёжных сервисов.","hr@sever-tech.example","https://sever-tech.example"]).map_err(storage)?;
    let need = demo_need();
    connection
        .execute(
            "INSERT INTO needs(id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            params![
                "need-backend-middle",
                "company-sever",
                "Backend-разработчик Rust",
                specialization(need.specialization),
                grade(need.grade),
                "remote",
                220000_u64,
                320000_u64,
                "Разработка сервисов обработки данных и надёжных API.",
                serde_json::to_string(&need.requirements).map_err(json_storage)?,
                true,
                now,
                now,
                now,
                1_u64
            ],
        )
        .map_err(storage)?;
    // Mirror of the mock's `shortlist-001` fixture for the demo employer.
    connection
        .execute(
            "INSERT INTO shortlists(id,company_id,title,members_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            params![
                "shortlist-001",
                "company-sever",
                "Бэкенд · Мидл",
                serde_json::to_string(&vec![
                    "candidate-024",
                    "candidate018",
                    "candidate041"
                ])
                .map_err(json_storage)?,
                now,
                now
            ],
        )
        .map_err(storage)?;
    Ok(())
}

fn demo_candidates(now: &str) -> Vec<CandidateProfile> {
    [
        (
            "candidate018",
            "Кандидат №018",
            "Илья Соколов",
            Grade::Middle,
            vec!["rust", "docker"],
        ),
        (
            "candidate031",
            "Кандидат №031",
            "Мария Волкова",
            Grade::Senior,
            vec!["rust", "postgresql", "docker", "redis"],
        ),
        (
            "candidate041",
            "Кандидат №041",
            "Никита Орлов",
            Grade::Middle,
            vec!["react"],
        ),
    ]
    .into_iter()
    .map(
        |(id, alias, name, verified_grade, stack)| CandidateProfile {
            id: id.into(),
            alias: alias.into(),
            email: format!("{id}@example.com"),
            name: name.into(),
            specialization: if id == "candidate041" {
                Specialization::Frontend
            } else {
                Specialization::Backend
            },
            selected_grade: verified_grade,
            stack: stack.into_iter().map(String::from).collect(),
            team_role: "Разработчик".into(),
            experience_months: Some(36),
            experience: "Коммерческая разработка и командные проекты.".into(),
            soft_skills: vec!["Командная работа".into()],
            consents: Consents {
                processing: true,
                publication: true,
            },
            verified_grade: Some(verified_grade),
            verified_specialization: Some(if id == "candidate041" {
                Specialization::Frontend
            } else {
                Specialization::Backend
            }),
            grade_confirmed_at: Some(now.into()),
            revision: 1,
            updated_at: now.into(),
        },
    )
    .collect()
}

fn demo_candidate_indexes() -> Vec<(&'static str, Vec<SkillEvidence>, Vec<EvidenceSource>, bool)> {
    let skills = |items: &[(&str, Grade)]| {
        items
            .iter()
            .map(|(id, grade)| SkillEvidence {
                skill_id: (*id).into(),
                status: EvidenceStatus::Confirmed,
                evidence_grade: Some(*grade),
                sources: vec![EvidenceSource::Assessment],
            })
            .collect()
    };
    vec![
        (
            "candidate-024",
            skills(&[
                ("rust", Grade::Junior),
                ("postgresql", Grade::Junior),
                ("docker", Grade::Junior),
            ]),
            vec![EvidenceSource::Assessment],
            false,
        ),
        (
            "candidate018",
            skills(&[("rust", Grade::Middle), ("docker", Grade::Middle)]),
            vec![EvidenceSource::Assessment, EvidenceSource::Fsp],
            true,
        ),
        (
            "candidate031",
            skills(&[
                ("rust", Grade::Senior),
                ("postgresql", Grade::Senior),
                ("docker", Grade::Middle),
                ("redis", Grade::Middle),
            ]),
            vec![EvidenceSource::Assessment, EvidenceSource::Fsp],
            true,
        ),
        (
            "candidate041",
            skills(&[("react", Grade::Middle)]),
            vec![EvidenceSource::Assessment],
            false,
        ),
    ]
}

fn demo_need() -> HiringNeed {
    let policy = EvidencePolicy {
        accept_assessments: true,
        accept_github: true,
        accept_fsp: true,
        competition_selection: "system".into(),
        competition_ids: Vec::new(),
    };
    HiringNeed {
        specialization: Specialization::Backend,
        grade: Grade::Middle,
        requirements: vec![
            Requirement {
                skill_id: "rust".into(),
                criticality: Criticality::Required,
                minimum_grade: Grade::Middle,
                evidence_policy: policy.clone(),
            },
            Requirement {
                skill_id: "postgresql".into(),
                criticality: Criticality::Required,
                minimum_grade: Grade::Junior,
                evidence_policy: policy.clone(),
            },
            Requirement {
                skill_id: "docker".into(),
                criticality: Criticality::Desired,
                minimum_grade: Grade::Junior,
                evidence_policy: policy,
            },
        ],
    }
}

fn save_candidate(
    connection: &Connection,
    value: &CandidateProfile,
    insert: bool,
) -> Result<(), RepositoryError> {
    let stack = serde_json::to_string(&value.stack)
        .map_err(|error| RepositoryError::Storage(error.to_string()))?;
    let soft = serde_json::to_string(&value.soft_skills)
        .map_err(|error| RepositoryError::Storage(error.to_string()))?;
    let sql = if insert {
        "INSERT INTO candidates(id,alias,email,name,specialization,selected_grade,stack_json,team_role,experience_months,experience,soft_skills_json,processing_consent,publication_consent,verified_grade,verified_specialization,grade_confirmed_at,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    } else {
        "UPDATE candidates SET alias=?,email=?,name=?,specialization=?,selected_grade=?,stack_json=?,team_role=?,experience_months=?,experience=?,soft_skills_json=?,processing_consent=?,publication_consent=?,verified_grade=?,verified_specialization=?,grade_confirmed_at=?,revision=?,updated_at=? WHERE id=?"
    };
    let changed = if insert {
        connection
            .execute(
                sql,
                params![
                    value.id,
                    value.alias,
                    value.email,
                    value.name,
                    specialization(value.specialization),
                    grade(value.selected_grade),
                    stack,
                    value.team_role,
                    value.experience_months,
                    value.experience,
                    soft,
                    value.consents.processing,
                    value.consents.publication,
                    value.verified_grade.map(grade),
                    value.verified_specialization.map(specialization),
                    value.grade_confirmed_at,
                    value.revision,
                    value.updated_at
                ],
            )
            .map_err(conflict)?
    } else {
        connection
            .execute(
                sql,
                params![
                    value.alias,
                    value.email,
                    value.name,
                    specialization(value.specialization),
                    grade(value.selected_grade),
                    stack,
                    value.team_role,
                    value.experience_months,
                    value.experience,
                    soft,
                    value.consents.processing,
                    value.consents.publication,
                    value.verified_grade.map(grade),
                    value.verified_specialization.map(specialization),
                    value.grade_confirmed_at,
                    value.revision,
                    value.updated_at,
                    value.id
                ],
            )
            .map_err(storage)?
    };
    if changed == 0 {
        return Err(RepositoryError::Storage("candidate not found".into()));
    }
    Ok(())
}

fn candidate_index(
    connection: &Connection,
    profile: CandidateProfile,
) -> Result<CandidateIndexRecord, RepositoryError> {
    let stored = connection
        .query_row(
            "SELECT work_modes_json,available_for_offers,skills_json,source_kinds_json,fsp_verified,last_signal_at FROM candidate_index WHERE candidate_id=?",
            [&profile.id],
            |row| {
                Ok((
                    parse_json::<Vec<String>>(row.get::<_, String>(0)?)?,
                    row.get::<_, bool>(1)?,
                    parse_json::<Vec<SkillEvidence>>(row.get::<_, String>(2)?)?,
                    parse_json::<Vec<EvidenceSource>>(row.get::<_, String>(3)?)?,
                    row.get::<_, bool>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()
        .map_err(storage)?;
    let (work_modes, available_for_offers, skills, source_kinds, fsp_verified, last_signal_at) =
        stored.unwrap_or_else(|| {
            let skills = profile
                .stack
                .iter()
                .map(|skill_id| SkillEvidence {
                    skill_id: skill_id.clone(),
                    status: EvidenceStatus::Observed,
                    evidence_grade: None,
                    sources: Vec::new(),
                })
                .collect();
            (
                vec!["remote".into()],
                false,
                skills,
                Vec::new(),
                false,
                None,
            )
        });
    let email_verified = connection
        .query_row(
            "SELECT email_verified FROM accounts WHERE candidate_id=?",
            [&profile.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage)?
        .unwrap_or(false);
    Ok(CandidateIndexRecord {
        profile,
        email_verified,
        work_modes,
        available_for_offers,
        skills,
        source_kinds,
        fsp_verified,
        last_signal_at,
    })
}

fn invitation_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<fsp_domain::InvitationRecord> {
    let status: String = row.get(8)?;
    Ok(fsp_domain::InvitationRecord {
        id: row.get(0)?,
        company_id: row.get(1)?,
        candidate_id: row.get(2)?,
        candidate_alias: row.get(3)?,
        company: parse_json(row.get::<_, String>(4)?)?,
        need: parse_json(row.get::<_, String>(5)?)?,
        need_definition: parse_json(row.get::<_, String>(6)?)?,
        message: row.get(7)?,
        status: fsp_domain::InteractionStatus::parse(&status).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
                rusqlite::types::Type::Text,
                format!("unknown invitation status {status}").into(),
            )
        })?,
        created_at: row.get(9)?,
        viewed_at: row.get(10)?,
        responded_at: row.get(11)?,
        disclosure_fields: parse_json(row.get::<_, String>(12)?)?,
    })
}

fn application_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<fsp_domain::ApplicationRecord> {
    let status: String = row.get(8)?;
    Ok(fsp_domain::ApplicationRecord {
        id: row.get(0)?,
        company_id: row.get(1)?,
        candidate_id: row.get(2)?,
        candidate_alias: row.get(3)?,
        company: parse_json(row.get::<_, String>(4)?)?,
        vacancy: parse_json(row.get::<_, String>(5)?)?,
        need_definition: parse_json(row.get::<_, String>(6)?)?,
        message: row.get(7)?,
        status: fsp_domain::InteractionStatus::parse(&status).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
                rusqlite::types::Type::Text,
                format!("unknown application status {status}").into(),
            )
        })?,
        created_at: row.get(9)?,
        viewed_at: row.get(10)?,
        responded_at: row.get(11)?,
        disclosure_fields: parse_json(row.get::<_, String>(12)?)?,
    })
}

fn disclosure_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<fsp_domain::DisclosureRecord> {
    Ok(fsp_domain::DisclosureRecord {
        candidate_id: row.get(0)?,
        company_id: row.get(1)?,
        invitation_id: row.get(2)?,
        application_id: row.get(3)?,
        granted_at: row.get(4)?,
        name: row.get(5)?,
        email: row.get(6)?,
        source_links: parse_json(row.get::<_, String>(7)?)?,
    })
}

fn shortlist_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<fsp_domain::ShortlistRecord> {
    let members: String = row.get(3)?;
    Ok(fsp_domain::ShortlistRecord {
        id: row.get(0)?,
        company_id: row.get(1)?,
        title: row.get(2)?,
        member_ids: serde_json::from_str(&members).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn need_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<HiringNeedRecord> {
    Ok(HiringNeedRecord {
        id: row.get(0)?,
        company_id: row.get(1)?,
        title: row.get(2)?,
        need: HiringNeed {
            specialization: parse_specialization(&row.get::<_, String>(3)?),
            grade: parse_grade(&row.get::<_, String>(4)?),
            requirements: parse_json(row.get::<_, String>(9)?)?,
        },
        work_mode: row.get(5)?,
        salary_from: row.get(6)?,
        salary_to: row.get(7)?,
        description: row.get(8)?,
        published: row.get(10)?,
        published_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        revision: row.get(14)?,
    })
}

fn source_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceRecord> {
    Ok(SourceRecord {
        id: row.get(0)?,
        candidate_id: row.get(1)?,
        provider: parse_source_provider(&row.get::<_, String>(2)?),
        synthetic: row.get(3)?,
        active_job_id: row.get(4)?,
        account_label: row.get(5)?,
        last_synced_at: row.get(6)?,
        analysis: row
            .get::<_, Option<String>>(7)?
            .map(parse_json)
            .transpose()?,
        verified_participation: row.get(8)?,
        competition_ids: parse_json(row.get::<_, String>(9)?)?,
    })
}

fn parse_json<T: DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            value.len(),
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn json_storage(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Storage(error.to_string())
}

fn account(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        email: row.get(1)?,
        role: parse_role(row.get::<_, String>(2)?.as_str()),
        candidate_id: row.get(3)?,
        company_id: row.get(4)?,
        email_verified: row.get(5)?,
    })
}
fn candidate(row: &rusqlite::Row<'_>) -> rusqlite::Result<CandidateProfile> {
    Ok(CandidateProfile {
        id: row.get(0)?,
        alias: row.get(1)?,
        email: row.get(2)?,
        name: row.get(3)?,
        specialization: parse_specialization(&row.get::<_, String>(4)?),
        selected_grade: parse_grade(&row.get::<_, String>(5)?),
        stack: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
        team_role: row.get(7)?,
        experience_months: row.get(8)?,
        experience: row.get(9)?,
        soft_skills: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or_default(),
        consents: Consents {
            processing: row.get(11)?,
            publication: row.get(12)?,
        },
        verified_grade: row
            .get::<_, Option<String>>(13)?
            .as_deref()
            .map(parse_grade),
        verified_specialization: row
            .get::<_, Option<String>>(14)?
            .as_deref()
            .map(parse_specialization),
        grade_confirmed_at: row.get(15)?,
        revision: row.get(16)?,
        updated_at: row.get(17)?,
    })
}
fn role(value: Role) -> &'static str {
    match value {
        Role::Candidate => "candidate",
        Role::Employer => "employer",
    }
}
fn parse_role(value: &str) -> Role {
    if value == "employer" {
        Role::Employer
    } else {
        Role::Candidate
    }
}
fn grade(value: Grade) -> &'static str {
    match value {
        Grade::Junior => "junior",
        Grade::Middle => "middle",
        Grade::Senior => "senior",
    }
}
fn parse_grade(value: &str) -> Grade {
    match value {
        "middle" => Grade::Middle,
        "senior" => Grade::Senior,
        _ => Grade::Junior,
    }
}
fn specialization(value: Specialization) -> &'static str {
    match value {
        Specialization::Backend => "backend",
        Specialization::Frontend => "frontend",
        Specialization::Fullstack => "fullstack",
    }
}
fn parse_specialization(value: &str) -> Specialization {
    match value {
        "frontend" => Specialization::Frontend,
        "fullstack" => Specialization::Fullstack,
        _ => Specialization::Backend,
    }
}
fn source_provider(value: SourceProvider) -> &'static str {
    match value {
        SourceProvider::Github => "github",
        SourceProvider::Fsp => "fsp",
    }
}
fn parse_source_provider(value: &str) -> SourceProvider {
    if value == "fsp" {
        SourceProvider::Fsp
    } else {
        SourceProvider::Github
    }
}
fn storage(error: rusqlite::Error) -> RepositoryError {
    RepositoryError::Storage(error.to_string())
}
fn conflict(error: rusqlite::Error) -> RepositoryError {
    if matches!(error, rusqlite::Error::SqliteFailure(ref code, _) if code.extended_code == 2067) {
        RepositoryError::Conflict
    } else {
        storage(error)
    }
}

const ACCOUNT_BY_EMAIL: &str =
    "SELECT id,email,role,candidate_id,company_id,email_verified FROM accounts WHERE email=?";
const ACCOUNT_BY_ID: &str =
    "SELECT id,email,role,candidate_id,company_id,email_verified FROM accounts WHERE id=?";
const NEED_SELECT: &str = "SELECT id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision FROM needs WHERE company_id=?";
const SCHEMA: &str = r#"
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL,candidate_id TEXT,company_id TEXT,email_verified INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,alias TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,specialization TEXT NOT NULL,selected_grade TEXT NOT NULL,stack_json TEXT NOT NULL,team_role TEXT NOT NULL,experience_months INTEGER,experience TEXT NOT NULL,soft_skills_json TEXT NOT NULL,processing_consent INTEGER NOT NULL,publication_consent INTEGER NOT NULL,verified_grade TEXT,verified_specialization TEXT,grade_confirmed_at TEXT,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,business_area TEXT NOT NULL,description TEXT NOT NULL,contact_email TEXT NOT NULL,website TEXT);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL,used INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_index(candidate_id TEXT PRIMARY KEY REFERENCES candidates(id),work_modes_json TEXT NOT NULL,available_for_offers INTEGER NOT NULL,skills_json TEXT NOT NULL,source_kinds_json TEXT NOT NULL,fsp_verified INTEGER NOT NULL,last_signal_at TEXT);
CREATE TABLE IF NOT EXISTS needs(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),title TEXT NOT NULL,specialization TEXT NOT NULL,grade TEXT NOT NULL,work_mode TEXT NOT NULL,salary_from INTEGER NOT NULL,salary_to INTEGER NOT NULL,description TEXT NOT NULL,requirements_json TEXT NOT NULL,published INTEGER NOT NULL,published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,candidate_id TEXT NOT NULL,expires_at TEXT NOT NULL,used INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS github_credentials(candidate_id TEXT PRIMARY KEY,access_token TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL,provider TEXT NOT NULL,synthetic INTEGER NOT NULL,active_job_id TEXT,account_label TEXT,last_synced_at TEXT,analysis_json TEXT,verified_participation INTEGER NOT NULL,competition_ids_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,result_source_id TEXT,error_code TEXT,error_message TEXT);
CREATE TABLE IF NOT EXISTS idempotency_keys(scope TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,status INTEGER NOT NULL,body_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shortlists(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),title TEXT NOT NULL,members_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,candidate_id TEXT NOT NULL,candidate_alias TEXT NOT NULL,company_json TEXT NOT NULL,need_json TEXT NOT NULL,need_definition_json TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,viewed_at TEXT,responded_at TEXT,disclosure_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS disclosures(company_id TEXT NOT NULL,candidate_id TEXT NOT NULL,invitation_id TEXT,application_id TEXT,granted_at TEXT,name TEXT,email TEXT,source_links_json TEXT NOT NULL,PRIMARY KEY(company_id,candidate_id));
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,candidate_id TEXT NOT NULL,candidate_alias TEXT NOT NULL,company_json TEXT NOT NULL,vacancy_json TEXT NOT NULL,need_definition_json TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,viewed_at TEXT,responded_at TEXT,disclosure_json TEXT NOT NULL);
"#;

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    use fsp_application::{
        CandidateSearch, EmailChallengeInput, EmailVerifyInput, PlatformService, ProfilePatch,
        VerificationDelivery,
    };

    use super::*;

    struct FixedDelivery;

    impl VerificationDelivery for FixedDelivery {
        fn code_for(&self) -> String {
            "123456".into()
        }

        fn deliver(&self, _: &str, _: &str) -> Result<(), String> {
            Ok(())
        }

        fn contract_name(&self) -> &'static str {
            "mock_mailbox"
        }
    }

    #[test]
    fn login_session_and_profile_survive_database_reopen() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("fsp-auth-{nonce}.sqlite3"));

        let service = PlatformService::new(
            Arc::new(SqliteRepository::open(&path).expect("database opens")),
            Arc::new(FixedDelivery),
        );
        let challenge = service
            .request_challenge(EmailChallengeInput {
                email: "New.Candidate@example.com".into(),
                role: Role::Candidate,
            })
            .expect("challenge is created");
        let wrong = service
            .verify_email(EmailVerifyInput {
                challenge_id: challenge.challenge_id.clone(),
                code: "000000".into(),
            })
            .expect_err("wrong code is rejected");
        assert_eq!(wrong.code, "invalid_code");

        let (session, token) = service
            .verify_email(EmailVerifyInput {
                challenge_id: challenge.challenge_id.clone(),
                code: "123456".into(),
            })
            .expect("correct code creates a session");
        assert_eq!(session.role, Role::Candidate);
        assert!(session.email_verified);
        let reused = service
            .verify_email(EmailVerifyInput {
                challenge_id: challenge.challenge_id,
                code: "123456".into(),
            })
            .expect_err("a challenge is one-time");
        assert_eq!(reused.code, "challenge_used");
        drop(service);

        let reopened = PlatformService::new(
            Arc::new(SqliteRepository::open(&path).expect("database reopens")),
            Arc::new(FixedDelivery),
        );
        let restored = reopened.session(&token).expect("session persists");
        let profile = reopened.profile(&restored).expect("profile persists");
        assert_eq!(profile.email, "new.candidate@example.com");
        let updated = reopened
            .update_profile(
                &restored,
                ProfilePatch {
                    name: Some("Мария Волкова".into()),
                    industry: Some("it".into()),
                    ..ProfilePatch::default()
                },
            )
            .expect("frontend profile payload is accepted");
        assert_eq!(updated.name, "Мария Волкова");
        let empty_patch = reopened
            .update_profile(&restored, ProfilePatch::default())
            .expect_err("empty profile patches violate the contract");
        assert_eq!(empty_patch.code, "validation_error");

        let mismatch = reopened
            .request_challenge(EmailChallengeInput {
                email: "new.candidate@example.com".into(),
                role: Role::Employer,
            })
            .expect_err("an account cannot change role during login");
        assert_eq!(mismatch.code, "role_mismatch");
        drop(reopened);
        std::fs::remove_file(path).expect("temporary database is removed");
    }

    #[test]
    fn seeded_recommendations_use_the_recorded_deterministic_order() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("fsp-ranking-{nonce}.sqlite3"));
        let service = PlatformService::new(
            Arc::new(SqliteRepository::open(&path).expect("database opens")),
            Arc::new(FixedDelivery),
        );
        service.initialize().expect("demo data is seeded");
        let challenge = service
            .request_challenge(EmailChallengeInput {
                email: "hr@sever-tech.example".into(),
                role: Role::Employer,
            })
            .expect("employer challenge is created");
        let (session, _) = service
            .verify_email(EmailVerifyInput {
                challenge_id: challenge.challenge_id,
                code: "123456".into(),
            })
            .expect("employer session is created");
        let page = service
            .candidate_search(
                &session,
                CandidateSearch {
                    need_id: Some("need-backend-middle".into()),
                    recommended: true,
                    page: 1,
                    page_size: 10,
                    ..CandidateSearch::default()
                },
            )
            .expect("recommendations are available");
        let ids = page
            .items
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, ["candidate031", "candidate018"]);
        assert_eq!(
            page.items[0]
                .r#match
                .as_ref()
                .expect("match exists")
                .required_met,
            2
        );
        drop(service);
        std::fs::remove_file(path).expect("temporary database is removed");
    }

    #[test]
    fn idempotency_keys_round_trip_and_keep_the_first_response() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("fsp-idem-{nonce}.sqlite3"));
        let repository = SqliteRepository::open(&path).expect("database opens");

        assert!(
            repository
                .idempotency_get("actor:op:/path:key-0001")
                .expect("lookup works")
                .is_none()
        );
        repository
            .idempotency_put(
                "actor:op:/path:key-0001",
                "{\"a\":1}",
                201,
                "{\"id\":\"one\"}",
                "2026-10-06T00:00:00Z",
            )
            .expect("first response is stored");
        // A racing retry must not overwrite the stored response.
        repository
            .idempotency_put(
                "actor:op:/path:key-0001",
                "{\"a\":2}",
                200,
                "{\"id\":\"two\"}",
                "2026-10-06T00:00:01Z",
            )
            .expect("conflicting inserts are ignored");
        let stored = repository
            .idempotency_get("actor:op:/path:key-0001")
            .expect("lookup works")
            .expect("response is stored");
        assert_eq!(stored.fingerprint, "{\"a\":1}");
        assert_eq!(stored.status, 201);
        assert_eq!(stored.body, "{\"id\":\"one\"}");
        drop(repository);
        std::fs::remove_file(path).expect("temporary database is removed");
    }

    #[test]
    fn shortlists_round_trip_and_stay_scoped_to_the_company() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("fsp-shortlists-{nonce}.sqlite3"));
        let repository = SqliteRepository::open(&path).expect("database opens");
        repository
            .connection()
            .expect("connection opens")
            .execute(
                "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES('company-sever','Север Тех','Разработка','','hr@sever-tech.example',NULL)",
                [],
            )
            .expect("company is stored");
        repository
            .save_shortlist(&fsp_domain::ShortlistRecord {
                id: "shortlist-test".into(),
                company_id: "company-sever".into(),
                title: "Кандидаты".into(),
                member_ids: vec!["candidate018".into()],
                created_at: "2026-10-06T00:00:00Z".into(),
                updated_at: "2026-10-06T00:00:00Z".into(),
            })
            .expect("shortlist is stored");

        let stored = repository
            .shortlist("company-sever", "shortlist-test")
            .expect("lookup works")
            .expect("shortlist exists");
        assert_eq!(stored.member_ids, ["candidate018"]);
        assert!(
            repository
                .shortlist("company-other", "shortlist-test")
                .expect("lookup works")
                .is_none()
        );
        assert_eq!(
            repository
                .shortlists("company-sever")
                .expect("list works")
                .len(),
            1
        );

        repository
            .delete_shortlist("company-sever", "shortlist-test")
            .expect("shortlist is removed");
        assert!(
            repository
                .shortlists("company-sever")
                .expect("list works")
                .is_empty()
        );
        drop(repository);
        std::fs::remove_file(path).expect("temporary database is removed");
    }

    #[test]
    fn invitations_and_disclosures_round_trip() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("fsp-invitations-{nonce}.sqlite3"));
        let repository = SqliteRepository::open(&path).expect("database opens");
        let need = HiringNeedRecord {
            id: "need-test".into(),
            company_id: "company-sever".into(),
            title: "Backend-разработчик".into(),
            need: demo_need(),
            work_mode: "remote".into(),
            salary_from: 200_000,
            salary_to: 300_000,
            description: "Описание вакансии".into(),
            published: true,
            published_at: Some("2026-10-06T00:00:00Z".into()),
            created_at: "2026-10-06T00:00:00Z".into(),
            updated_at: "2026-10-06T00:00:00Z".into(),
            revision: 1,
        };
        let record = fsp_domain::InvitationRecord {
            id: "invitation-test".into(),
            company_id: "company-sever".into(),
            candidate_id: "candidate018".into(),
            candidate_alias: "Кандидат №018".into(),
            company: fsp_domain::CompanyCard {
                id: "company-sever".into(),
                display_name: "Север Тех".into(),
                business_area: "Разработка".into(),
                description: String::new(),
                contact_email: "hr@sever-tech.example".into(),
            },
            need: fsp_domain::NeedSnapshot {
                id: need.id.clone(),
                title: need.title.clone(),
                work_mode: need.work_mode.clone(),
                salary_from: need.salary_from,
                salary_to: need.salary_to,
                description: need.description.clone(),
            },
            need_definition: need,
            message: "Приглашаем на интервью".into(),
            status: fsp_domain::InteractionStatus::Sent,
            created_at: "2026-10-06T00:00:00Z".into(),
            viewed_at: None,
            responded_at: None,
            disclosure_fields: Vec::new(),
        };
        repository
            .save_invitation(&record)
            .expect("invitation is stored");

        let stored = repository
            .invitation("invitation-test")
            .expect("lookup works")
            .expect("invitation exists");
        assert_eq!(stored.status, fsp_domain::InteractionStatus::Sent);
        assert_eq!(stored.need.id, "need-test");
        assert_eq!(stored.need_definition.id, "need-test");
        assert_eq!(repository.invitations("company-sever").unwrap().len(), 1);
        assert_eq!(
            repository
                .candidate_invitations("candidate018")
                .unwrap()
                .len(),
            1
        );
        assert!(
            repository
                .candidate_invitations("candidate031")
                .unwrap()
                .is_empty()
        );

        repository
            .save_disclosure(&fsp_domain::DisclosureRecord {
                candidate_id: "candidate018".into(),
                company_id: "company-sever".into(),
                invitation_id: Some("invitation-test".into()),
                application_id: None,
                granted_at: Some("2026-10-06T00:00:00Z".into()),
                name: Some("Илья Соколов".into()),
                email: None,
                source_links: vec!["https://github.com/example".into()],
            })
            .expect("disclosure is stored");
        let grant = repository
            .disclosure("company-sever", "candidate018")
            .expect("lookup works")
            .expect("grant exists");
        assert_eq!(grant.name.as_deref(), Some("Илья Соколов"));
        assert!(grant.email.is_none());
        assert_eq!(grant.source_links, ["https://github.com/example"]);

        repository
            .delete_disclosure("company-sever", "candidate018")
            .expect("disclosure is removed");
        assert!(
            repository
                .disclosure("company-sever", "candidate018")
                .expect("lookup works")
                .is_none()
        );
        drop(repository);
        std::fs::remove_file(path).expect("temporary database is removed");
    }
}
