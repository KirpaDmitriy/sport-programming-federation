//! PostgreSQL storage adapter for the platform repository port.
//!
//! One `PgPool` backs every operation; multi-statement units (challenge
//! consumption, demo seeding) run in explicit transactions. JSON fields stay
//! as text payloads because the SQL layer never inspects them, and RFC3339
//! timestamps stay as text: their ISO form sorts correctly lexicographically.

mod seed;

use fsp_application::{
    ConsumeChallenge, PendingChallenge, PlatformRepository, RepositoryError,
    StoredIdempotentResponse,
};
use fsp_domain::{
    Account, CandidateIndexRecord, CandidateProfile, Company, Consents, Grade, HiringNeedRecord,
    JobRecord, Role, SourceRecord, Specialization,
};
use serde::de::DeserializeOwned;
use sqlx::Row;
use sqlx::postgres::{PgPool, PgPoolOptions, PgRow};

pub struct PostgresRepository {
    pool: PgPool,
}

impl PostgresRepository {
    /// Connects to `url` and applies every pending migration.
    pub async fn connect(url: &str) -> Result<Self, RepositoryError> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(url)
            .await
            .map_err(storage)?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|error| RepositoryError::Storage(error.to_string()))?;
        Ok(Self { pool })
    }

    /// The underlying pool — used by tests for fixture inserts.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Creates an isolated `fsp_test_<uuid>` database against the admin
    /// connection string `admin_url` (for example
    /// `postgres://postgres:postgres@127.0.0.1:5432/postgres`). Idle test
    /// databases left behind by earlier runs are reaped first; live tests keep
    /// at least one pooled connection so their database is never reaped.
    #[cfg(feature = "testing")]
    pub async fn connect_test_database(admin_url: &str) -> (Self, TestDatabase) {
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect(admin_url)
            .await
            .expect("test admin database accepts connections");
        let stale: Vec<String> = sqlx::query_scalar(
            "SELECT datname FROM pg_database d \
             WHERE datname LIKE 'fsp_test_%' \
             AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)",
        )
        .fetch_all(&admin)
        .await
        .expect("stale test databases are listed");
        for stale_name in stale {
            sqlx::query(&format!("DROP DATABASE IF EXISTS \"{stale_name}\""))
                .execute(&admin)
                .await
                .expect("stale test database is dropped");
        }
        let name = format!("fsp_test_{}", uuid::Uuid::new_v4().simple());
        sqlx::query(&format!("CREATE DATABASE \"{name}\""))
            .execute(&admin)
            .await
            .expect("test database is created");
        admin.close().await;
        let mut url = admin_url.to_string();
        if let Some(slash) = url.rfind('/') {
            url.replace_range(slash + 1.., &name);
        }
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .min_connections(1)
            .connect(&url)
            .await
            .expect("test database accepts connections");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("test database runs migrations");
        (
            Self { pool },
            TestDatabase {
                name,
                url,
                admin_url: admin_url.to_string(),
            },
        )
    }
}

/// Handle to a per-test database created by [`PostgresRepository::connect_test_database`].
#[cfg(feature = "testing")]
pub struct TestDatabase {
    pub name: String,
    pub url: String,
    pub admin_url: String,
}

const ACCOUNT_COLUMNS: &str = "id,email,role,candidate_id,company_id,email_verified";
const CANDIDATE_COLUMNS: &str = "id,alias,email,name,specialization,selected_grade,stack_json,team_role,experience_months,experience,soft_skills_json,processing_consent,publication_consent,verified_grade,verified_specialization,grade_confirmed_at,revision,updated_at";
const NEED_COLUMNS: &str = "id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision";
const SOURCE_COLUMNS: &str = "id,candidate_id,provider,synthetic,active_job_id,account_label,last_synced_at,analysis_json,verified_participation,competition_ids_json";
const JOB_COLUMNS: &str = "id,owner_id,kind,status,created_at,updated_at,candidate_id,assessment_id,input_revision,result_json,confirmed,result_source_id,error_code,error_message";
const INVITATION_COLUMNS: &str = "id,company_id,candidate_id,candidate_alias,company_json,need_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json";
const APPLICATION_COLUMNS: &str = "id,company_id,candidate_id,candidate_alias,company_json,vacancy_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json";
const TASK_COLUMNS: &str =
    "id,company_id,title,prompt,skill_id,grade,estimate_minutes,status,created_at";
const TASK_RESPONSE_COLUMNS: &str = "id,candidate_id,company_id,candidate_alias,task_json,mode,answer,status,feedback,submitted_at,reviewed_at";
const ASSESSMENT_COLUMNS: &str = "id,candidate_id,specialization,grade,status,task_json,answer_json,checks_json,result_json,created_at,updated_at,revision";
const SHORTLIST_COLUMNS: &str = "id,company_id,title,members_json,created_at,updated_at";
const DISCLOSURE_COLUMNS: &str =
    "candidate_id,company_id,invitation_id,application_id,granted_at,name,email,source_links_json";

#[async_trait::async_trait]
impl PlatformRepository for PostgresRepository {
    async fn account_by_email(&self, email: &str) -> Result<Option<Account>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {ACCOUNT_COLUMNS} FROM accounts WHERE email=$1"
        ))
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| account(&row))
        .transpose()
    }

    async fn account_by_id(&self, id: &str) -> Result<Option<Account>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {ACCOUNT_COLUMNS} FROM accounts WHERE id=$1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| account(&row))
        .transpose()
    }

    async fn create_account(&self, value: &Account, now: &str) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO accounts(id,email,role,candidate_id,company_id,email_verified,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(&value.id)
        .bind(&value.email)
        .bind(role(value.role))
        .bind(&value.candidate_id)
        .bind(&value.company_id)
        .bind(value.email_verified)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(conflict)?;
        Ok(())
    }

    async fn create_candidate(&self, value: &CandidateProfile) -> Result<(), RepositoryError> {
        insert_candidate(&self.pool, value).await
    }

    async fn create_company(&self, value: &Company) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES($1,$2,$3,$4,$5,$6)",
        )
        .bind(&value.id)
        .bind(&value.display_name)
        .bind(&value.business_area)
        .bind(&value.description)
        .bind(&value.contact_email)
        .bind(&value.website)
        .execute(&self.pool)
        .await
        .map_err(conflict)?;
        Ok(())
    }

    async fn save_challenge(&self, value: &PendingChallenge) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO challenges(id,account_id,code_hash,expires_at,attempts,used) VALUES($1,$2,$3,$4,$5,$6)",
        )
        .bind(&value.id)
        .bind(&value.account_id)
        .bind(&value.code_hash)
        .bind(&value.expires_at)
        .bind(i32::from(value.attempts))
        .bind(value.used)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn consume_challenge(
        &self,
        id: &str,
        code_hash: &str,
        now: &str,
    ) -> Result<(ConsumeChallenge, Option<Account>), RepositoryError> {
        let mut transaction = self.pool.begin().await.map_err(storage)?;
        let challenge = sqlx::query(
            "SELECT account_id,code_hash,expires_at,attempts,used FROM challenges WHERE id=$1 FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(storage)?;
        let Some(challenge) = challenge else {
            return Ok((ConsumeChallenge::Missing, None));
        };
        let account_id: String = challenge.try_get("account_id").map_err(storage)?;
        let expected: String = challenge.try_get("code_hash").map_err(storage)?;
        let expires_at: String = challenge.try_get("expires_at").map_err(storage)?;
        let attempts: i32 = challenge.try_get("attempts").map_err(storage)?;
        let used: bool = challenge.try_get("used").map_err(storage)?;
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
            sqlx::query("UPDATE challenges SET attempts=attempts+1 WHERE id=$1")
                .bind(id)
                .execute(&mut *transaction)
                .await
                .map_err(storage)?;
            transaction.commit().await.map_err(storage)?;
            return Ok((
                if attempts + 1 >= 5 {
                    ConsumeChallenge::Locked
                } else {
                    ConsumeChallenge::WrongCode
                },
                None,
            ));
        }
        sqlx::query("UPDATE challenges SET used=TRUE WHERE id=$1")
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(storage)?;
        sqlx::query("UPDATE accounts SET email_verified=TRUE WHERE id=$1")
            .bind(&account_id)
            .execute(&mut *transaction)
            .await
            .map_err(storage)?;
        let account = sqlx::query(&format!(
            "SELECT {ACCOUNT_COLUMNS} FROM accounts WHERE id=$1"
        ))
        .bind(&account_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(storage)?
        .map(|row| account(&row))
        .transpose()?;
        transaction.commit().await.map_err(storage)?;
        Ok((ConsumeChallenge::Consumed, account))
    }

    async fn create_session(
        &self,
        token_hash: &str,
        account_id: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query("INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)")
            .bind(token_hash)
            .bind(account_id)
            .bind(expires_at)
            .execute(&self.pool)
            .await
            .map_err(storage)?;
        Ok(())
    }

    async fn account_for_session(
        &self,
        token_hash: &str,
        now: &str,
    ) -> Result<Option<Account>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {ACCOUNT_COLUMNS} FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>$2"
        ))
        .bind(token_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| account(&row))
        .transpose()
    }

    async fn delete_session(&self, token_hash: &str) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(token_hash)
            .execute(&self.pool)
            .await
            .map_err(storage)?;
        Ok(())
    }

    async fn candidate(&self, id: &str) -> Result<Option<CandidateProfile>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {CANDIDATE_COLUMNS} FROM candidates WHERE id=$1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| candidate(&row))
        .transpose()
    }

    async fn save_candidate(&self, value: &CandidateProfile) -> Result<(), RepositoryError> {
        update_candidate(&self.pool, value).await
    }

    async fn company(&self, id: &str) -> Result<Option<Company>, RepositoryError> {
        sqlx::query(
            "SELECT id,display_name,business_area,description,contact_email,website FROM companies WHERE id=$1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| {
            Ok(Company {
                id: row.try_get(0).map_err(storage)?,
                display_name: row.try_get(1).map_err(storage)?,
                business_area: row.try_get(2).map_err(storage)?,
                description: row.try_get(3).map_err(storage)?,
                contact_email: row.try_get(4).map_err(storage)?,
                website: row.try_get(5).map_err(storage)?,
            })
        })
        .transpose()
    }

    async fn save_company(&self, value: &Company) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE companies SET display_name=$1,business_area=$2,description=$3,contact_email=$4,website=$5 WHERE id=$6",
        )
        .bind(&value.display_name)
        .bind(&value.business_area)
        .bind(&value.description)
        .bind(&value.contact_email)
        .bind(&value.website)
        .bind(&value.id)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn candidates(&self) -> Result<Vec<CandidateIndexRecord>, RepositoryError> {
        let rows = sqlx::query(
            "SELECT c.id,c.alias,c.email,c.name,c.specialization,c.selected_grade,c.stack_json,\
             c.team_role,c.experience_months,c.experience,c.soft_skills_json,c.processing_consent,\
             c.publication_consent,c.verified_grade,c.verified_specialization,c.grade_confirmed_at,\
             c.revision,c.updated_at,\
             i.work_modes_json,i.available_for_offers,i.skills_json,i.source_kinds_json,\
             i.fsp_verified,i.last_signal_at,\
             (SELECT a.email_verified FROM accounts a WHERE a.candidate_id=c.id LIMIT 1) \
             AS account_email_verified \
             FROM candidates c LEFT JOIN candidate_index i ON i.candidate_id=c.id",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?;
        rows.iter().map(candidate_index).collect()
    }

    async fn needs(&self, company_id: &str) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {NEED_COLUMNS} FROM needs WHERE company_id=$1 ORDER BY created_at,id"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(need_record)
        .collect()
    }

    async fn need(
        &self,
        company_id: &str,
        need_id: &str,
    ) -> Result<Option<HiringNeedRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {NEED_COLUMNS} FROM needs WHERE company_id=$1 AND id=$2"
        ))
        .bind(company_id)
        .bind(need_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| need_record(&row))
        .transpose()
    }

    async fn save_need(&self, value: &HiringNeedRecord) -> Result<(), RepositoryError> {
        let requirements = serde_json::to_string(&value.need.requirements).map_err(json_storage)?;
        sqlx::query(
            "INSERT INTO needs(id,company_id,title,specialization,grade,work_mode,salary_from,salary_to,description,requirements_json,published,published_at,created_at,updated_at,revision) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) \
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,specialization=excluded.specialization,grade=excluded.grade,work_mode=excluded.work_mode,salary_from=excluded.salary_from,salary_to=excluded.salary_to,description=excluded.description,requirements_json=excluded.requirements_json,published=excluded.published,published_at=excluded.published_at,created_at=excluded.created_at,updated_at=excluded.updated_at,revision=excluded.revision",
        )
        .bind(&value.id)
        .bind(&value.company_id)
        .bind(&value.title)
        .bind(specialization(value.need.specialization))
        .bind(grade(value.need.grade))
        .bind(&value.work_mode)
        .bind(value.salary_from as i64)
        .bind(value.salary_to as i64)
        .bind(&value.description)
        .bind(requirements)
        .bind(value.published)
        .bind(&value.published_at)
        .bind(&value.created_at)
        .bind(&value.updated_at)
        .bind(value.revision as i64)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn delete_need(&self, company_id: &str, need_id: &str) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM needs WHERE id=$1 AND company_id=$2")
            .bind(need_id)
            .bind(company_id)
            .execute(&self.pool)
            .await
            .map_err(storage)?;
        Ok(())
    }

    async fn published_needs(&self) -> Result<Vec<HiringNeedRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {NEED_COLUMNS} FROM needs WHERE published=TRUE ORDER BY created_at,id"
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(need_record)
        .collect()
    }

    async fn shortlists(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ShortlistRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {SHORTLIST_COLUMNS} FROM shortlists WHERE company_id=$1 ORDER BY seq"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(shortlist_record)
        .collect()
    }

    async fn shortlist(
        &self,
        company_id: &str,
        shortlist_id: &str,
    ) -> Result<Option<fsp_domain::ShortlistRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {SHORTLIST_COLUMNS} FROM shortlists WHERE company_id=$1 AND id=$2"
        ))
        .bind(company_id)
        .bind(shortlist_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| shortlist_record(&row))
        .transpose()
    }

    async fn save_shortlist(
        &self,
        value: &fsp_domain::ShortlistRecord,
    ) -> Result<(), RepositoryError> {
        let members = serde_json::to_string(&value.member_ids).map_err(json_storage)?;
        sqlx::query(
            "INSERT INTO shortlists(id,company_id,title,members_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) \
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,members_json=excluded.members_json,created_at=excluded.created_at,updated_at=excluded.updated_at",
        )
        .bind(&value.id)
        .bind(&value.company_id)
        .bind(&value.title)
        .bind(members)
        .bind(&value.created_at)
        .bind(&value.updated_at)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn delete_shortlist(
        &self,
        company_id: &str,
        shortlist_id: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM shortlists WHERE id=$1 AND company_id=$2")
            .bind(shortlist_id)
            .bind(company_id)
            .execute(&self.pool)
            .await
            .map_err(storage)?;
        Ok(())
    }

    async fn invitations(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {INVITATION_COLUMNS} FROM invitations WHERE company_id=$1 ORDER BY seq"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(invitation_record)
        .collect()
    }

    async fn candidate_invitations(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::InvitationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {INVITATION_COLUMNS} FROM invitations WHERE candidate_id=$1 ORDER BY seq"
        ))
        .bind(candidate_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(invitation_record)
        .collect()
    }

    async fn invitation(
        &self,
        invitation_id: &str,
    ) -> Result<Option<fsp_domain::InvitationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {INVITATION_COLUMNS} FROM invitations WHERE id=$1"
        ))
        .bind(invitation_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| invitation_record(&row))
        .transpose()
    }

    async fn save_invitation(
        &self,
        value: &fsp_domain::InvitationRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO invitations(id,company_id,candidate_id,candidate_alias,company_json,need_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) \
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,candidate_id=excluded.candidate_id,candidate_alias=excluded.candidate_alias,company_json=excluded.company_json,need_json=excluded.need_json,need_definition_json=excluded.need_definition_json,message=excluded.message,status=excluded.status,created_at=excluded.created_at,viewed_at=excluded.viewed_at,responded_at=excluded.responded_at,disclosure_json=excluded.disclosure_json",
        )
        .bind(&value.id)
        .bind(&value.company_id)
        .bind(&value.candidate_id)
        .bind(&value.candidate_alias)
        .bind(serde_json::to_string(&value.company).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.need).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.need_definition).map_err(json_storage)?)
        .bind(&value.message)
        .bind(value.status.as_str())
        .bind(&value.created_at)
        .bind(&value.viewed_at)
        .bind(&value.responded_at)
        .bind(serde_json::to_string(&value.disclosure_fields).map_err(json_storage)?)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<Option<fsp_domain::DisclosureRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {DISCLOSURE_COLUMNS} FROM disclosures WHERE company_id=$1 AND candidate_id=$2"
        ))
        .bind(company_id)
        .bind(candidate_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| disclosure_record(&row))
        .transpose()
    }

    async fn save_disclosure(
        &self,
        value: &fsp_domain::DisclosureRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO disclosures(company_id,candidate_id,invitation_id,application_id,granted_at,name,email,source_links_json) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) \
             ON CONFLICT(company_id,candidate_id) DO UPDATE SET invitation_id=excluded.invitation_id,application_id=excluded.application_id,granted_at=excluded.granted_at,name=excluded.name,email=excluded.email,source_links_json=excluded.source_links_json",
        )
        .bind(&value.company_id)
        .bind(&value.candidate_id)
        .bind(&value.invitation_id)
        .bind(&value.application_id)
        .bind(&value.granted_at)
        .bind(&value.name)
        .bind(&value.email)
        .bind(serde_json::to_string(&value.source_links).map_err(json_storage)?)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn delete_disclosure(
        &self,
        company_id: &str,
        candidate_id: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM disclosures WHERE company_id=$1 AND candidate_id=$2")
            .bind(company_id)
            .bind(candidate_id)
            .execute(&self.pool)
            .await
            .map_err(storage)?;
        Ok(())
    }

    async fn company_applications(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {APPLICATION_COLUMNS} FROM applications WHERE company_id=$1 ORDER BY seq"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(application_record)
        .collect()
    }

    async fn candidate_applications(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::ApplicationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {APPLICATION_COLUMNS} FROM applications WHERE candidate_id=$1 ORDER BY seq"
        ))
        .bind(candidate_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(application_record)
        .collect()
    }

    async fn application(
        &self,
        application_id: &str,
    ) -> Result<Option<fsp_domain::ApplicationRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {APPLICATION_COLUMNS} FROM applications WHERE id=$1"
        ))
        .bind(application_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| application_record(&row))
        .transpose()
    }

    async fn save_application(
        &self,
        value: &fsp_domain::ApplicationRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO applications(id,company_id,candidate_id,candidate_alias,company_json,vacancy_json,need_definition_json,message,status,created_at,viewed_at,responded_at,disclosure_json) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) \
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,candidate_id=excluded.candidate_id,candidate_alias=excluded.candidate_alias,company_json=excluded.company_json,vacancy_json=excluded.vacancy_json,need_definition_json=excluded.need_definition_json,message=excluded.message,status=excluded.status,created_at=excluded.created_at,viewed_at=excluded.viewed_at,responded_at=excluded.responded_at,disclosure_json=excluded.disclosure_json",
        )
        .bind(&value.id)
        .bind(&value.company_id)
        .bind(&value.candidate_id)
        .bind(&value.candidate_alias)
        .bind(serde_json::to_string(&value.company).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.vacancy).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.need_definition).map_err(json_storage)?)
        .bind(&value.message)
        .bind(value.status.as_str())
        .bind(&value.created_at)
        .bind(&value.viewed_at)
        .bind(&value.responded_at)
        .bind(serde_json::to_string(&value.disclosure_fields).map_err(json_storage)?)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn tasks(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::TaskRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {TASK_COLUMNS} FROM tasks WHERE company_id=$1 ORDER BY created_at,id"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(task_record)
        .collect()
    }

    async fn active_tasks(&self) -> Result<Vec<fsp_domain::TaskRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {TASK_COLUMNS} FROM tasks WHERE status='active' ORDER BY created_at,id"
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(task_record)
        .collect()
    }

    async fn task(&self, task_id: &str) -> Result<Option<fsp_domain::TaskRecord>, RepositoryError> {
        sqlx::query(&format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id=$1"))
            .bind(task_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(storage)?
            .map(|row| task_record(&row))
            .transpose()
    }

    async fn save_task(&self, value: &fsp_domain::TaskRecord) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO tasks(id,company_id,title,prompt,skill_id,grade,estimate_minutes,status,created_at) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) \
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,prompt=excluded.prompt,skill_id=excluded.skill_id,grade=excluded.grade,estimate_minutes=excluded.estimate_minutes,status=excluded.status,created_at=excluded.created_at",
        )
        .bind(&value.id)
        .bind(&value.company_id)
        .bind(&value.title)
        .bind(&value.prompt)
        .bind(&value.skill_id)
        .bind(grade(value.grade))
        .bind(value.estimate_minutes as i32)
        .bind(value.status.as_str())
        .bind(&value.created_at)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn candidate_task_responses(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::TaskResponseRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {TASK_RESPONSE_COLUMNS} FROM task_responses WHERE candidate_id=$1 ORDER BY seq"
        ))
        .bind(candidate_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(task_response_record)
        .collect()
    }

    async fn company_task_responses(
        &self,
        company_id: &str,
    ) -> Result<Vec<fsp_domain::TaskResponseRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {TASK_RESPONSE_COLUMNS} FROM task_responses WHERE company_id=$1 ORDER BY seq"
        ))
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(task_response_record)
        .collect()
    }

    async fn task_response(
        &self,
        response_id: &str,
    ) -> Result<Option<fsp_domain::TaskResponseRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {TASK_RESPONSE_COLUMNS} FROM task_responses WHERE id=$1"
        ))
        .bind(response_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| task_response_record(&row))
        .transpose()
    }

    async fn save_task_response(
        &self,
        value: &fsp_domain::TaskResponseRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO task_responses(id,candidate_id,company_id,candidate_alias,task_json,mode,answer,status,feedback,submitted_at,reviewed_at) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) \
             ON CONFLICT(id) DO UPDATE SET candidate_id=excluded.candidate_id,company_id=excluded.company_id,candidate_alias=excluded.candidate_alias,task_json=excluded.task_json,mode=excluded.mode,answer=excluded.answer,status=excluded.status,feedback=excluded.feedback,submitted_at=excluded.submitted_at,reviewed_at=excluded.reviewed_at",
        )
        .bind(&value.id)
        .bind(&value.candidate_id)
        .bind(&value.task.company_id)
        .bind(&value.candidate_alias)
        .bind(serde_json::to_string(&value.task).map_err(json_storage)?)
        .bind(value.mode.as_str())
        .bind(&value.answer)
        .bind(value.status.as_str())
        .bind(&value.feedback)
        .bind(&value.submitted_at)
        .bind(&value.reviewed_at)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn save_candidate_index(
        &self,
        record: &CandidateIndexRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO candidate_index(candidate_id,work_modes_json,available_for_offers,skills_json,source_kinds_json,fsp_verified,last_signal_at) \
             VALUES($1,$2,$3,$4,$5,$6,$7) \
             ON CONFLICT(candidate_id) DO UPDATE SET work_modes_json=excluded.work_modes_json,available_for_offers=excluded.available_for_offers,skills_json=excluded.skills_json,source_kinds_json=excluded.source_kinds_json,fsp_verified=excluded.fsp_verified,last_signal_at=excluded.last_signal_at",
        )
        .bind(&record.profile.id)
        .bind(serde_json::to_string(&record.work_modes).map_err(json_storage)?)
        .bind(record.available_for_offers)
        .bind(serde_json::to_string(&record.skills).map_err(json_storage)?)
        .bind(serde_json::to_string(&record.source_kinds).map_err(json_storage)?)
        .bind(record.fsp_verified)
        .bind(&record.last_signal_at)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn candidate_assessments(
        &self,
        candidate_id: &str,
    ) -> Result<Vec<fsp_domain::AssessmentRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {ASSESSMENT_COLUMNS} FROM assessments WHERE candidate_id=$1 ORDER BY created_at,id"
        ))
        .bind(candidate_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(assessment_record)
        .collect()
    }

    async fn assessment(
        &self,
        assessment_id: &str,
    ) -> Result<Option<fsp_domain::AssessmentRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {ASSESSMENT_COLUMNS} FROM assessments WHERE id=$1"
        ))
        .bind(assessment_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| assessment_record(&row))
        .transpose()
    }

    async fn save_assessment(
        &self,
        value: &fsp_domain::AssessmentRecord,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO assessments(id,candidate_id,specialization,grade,status,task_json,answer_json,checks_json,result_json,created_at,updated_at,revision) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) \
             ON CONFLICT(id) DO UPDATE SET candidate_id=excluded.candidate_id,specialization=excluded.specialization,grade=excluded.grade,status=excluded.status,task_json=excluded.task_json,answer_json=excluded.answer_json,checks_json=excluded.checks_json,result_json=excluded.result_json,created_at=excluded.created_at,updated_at=excluded.updated_at,revision=excluded.revision",
        )
        .bind(&value.id)
        .bind(&value.candidate_id)
        .bind(specialization(value.specialization))
        .bind(grade(value.grade))
        .bind(value.status.as_str())
        .bind(serde_json::to_string(&value.task).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.answer).map_err(json_storage)?)
        .bind(serde_json::to_string(&value.checks).map_err(json_storage)?)
        .bind(value.result.as_ref().map(serde_json::to_string).transpose().map_err(json_storage)?)
        .bind(&value.created_at)
        .bind(&value.updated_at)
        .bind(value.revision as i64)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn save_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        expires_at: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO oauth_states(state,candidate_id,expires_at,used) VALUES($1,$2,$3,FALSE)",
        )
        .bind(state)
        .bind(candidate_id)
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn consume_oauth_state(
        &self,
        candidate_id: &str,
        state: &str,
        now: &str,
    ) -> Result<bool, RepositoryError> {
        let changed = sqlx::query(
            "UPDATE oauth_states SET used=TRUE WHERE state=$1 AND candidate_id=$2 AND expires_at>$3 AND used=FALSE",
        )
        .bind(state)
        .bind(candidate_id)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(storage)?
        .rows_affected();
        Ok(changed == 1)
    }

    async fn save_github_token(
        &self,
        candidate_id: &str,
        token: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO github_credentials(candidate_id,access_token) VALUES($1,$2) \
             ON CONFLICT(candidate_id) DO UPDATE SET access_token=excluded.access_token",
        )
        .bind(candidate_id)
        .bind(token)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn github_token(&self, candidate_id: &str) -> Result<Option<String>, RepositoryError> {
        sqlx::query("SELECT access_token FROM github_credentials WHERE candidate_id=$1")
            .bind(candidate_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(storage)?
            .map(|row| row.try_get::<String, _>(0).map_err(storage))
            .transpose()
    }

    async fn sources(&self, candidate_id: &str) -> Result<Vec<SourceRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {SOURCE_COLUMNS} FROM sources WHERE candidate_id=$1 ORDER BY id"
        ))
        .bind(candidate_id)
        .fetch_all(&self.pool)
        .await
        .map_err(storage)?
        .iter()
        .map(source_record)
        .collect()
    }

    async fn save_source(&self, source: &SourceRecord) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO sources(id,candidate_id,provider,synthetic,active_job_id,account_label,last_synced_at,analysis_json,verified_participation,competition_ids_json) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) \
             ON CONFLICT(id) DO UPDATE SET active_job_id=excluded.active_job_id,account_label=excluded.account_label,last_synced_at=excluded.last_synced_at,analysis_json=excluded.analysis_json,verified_participation=excluded.verified_participation,competition_ids_json=excluded.competition_ids_json",
        )
        .bind(&source.id)
        .bind(&source.candidate_id)
        .bind(source_provider(source.provider))
        .bind(source.synthetic)
        .bind(&source.active_job_id)
        .bind(&source.account_label)
        .bind(&source.last_synced_at)
        .bind(source.analysis.as_ref().map(serde_json::to_string).transpose().map_err(json_storage)?)
        .bind(source.verified_participation)
        .bind(serde_json::to_string(&source.competition_ids).map_err(json_storage)?)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn save_job(&self, job: &JobRecord) -> Result<(), RepositoryError> {
        sqlx::query(
            "INSERT INTO jobs(id,owner_id,kind,status,created_at,updated_at,candidate_id,assessment_id,input_revision,result_json,confirmed,result_source_id,error_code,error_message) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) \
             ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status=excluded.status,updated_at=excluded.updated_at,candidate_id=excluded.candidate_id,assessment_id=excluded.assessment_id,input_revision=excluded.input_revision,result_json=excluded.result_json,confirmed=excluded.confirmed,result_source_id=excluded.result_source_id,error_code=excluded.error_code,error_message=excluded.error_message",
        )
        .bind(&job.id)
        .bind(&job.owner_id)
        .bind(&job.kind)
        .bind(&job.status)
        .bind(&job.created_at)
        .bind(&job.updated_at)
        .bind(&job.candidate_id)
        .bind(&job.assessment_id)
        .bind(job.input_revision.map(|value| value as i64))
        .bind(&job.result_json)
        .bind(job.confirmed)
        .bind(&job.result_source_id)
        .bind(&job.error_code)
        .bind(&job.error_message)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn job(
        &self,
        owner_id: &str,
        job_id: &str,
    ) -> Result<Option<JobRecord>, RepositoryError> {
        sqlx::query(&format!(
            "SELECT {JOB_COLUMNS} FROM jobs WHERE owner_id=$1 AND id=$2"
        ))
        .bind(owner_id)
        .bind(job_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage)?
        .map(|row| {
            Ok(JobRecord {
                id: row.try_get("id").map_err(storage)?,
                owner_id: row.try_get("owner_id").map_err(storage)?,
                kind: row.try_get("kind").map_err(storage)?,
                status: row.try_get("status").map_err(storage)?,
                created_at: row.try_get("created_at").map_err(storage)?,
                updated_at: row.try_get("updated_at").map_err(storage)?,
                candidate_id: row.try_get("candidate_id").map_err(storage)?,
                assessment_id: row.try_get("assessment_id").map_err(storage)?,
                input_revision: row
                    .try_get::<Option<i64>, _>("input_revision")
                    .map_err(storage)?
                    .map(|value| value as u64),
                result_json: row.try_get("result_json").map_err(storage)?,
                confirmed: row.try_get("confirmed").map_err(storage)?,
                result_source_id: row.try_get("result_source_id").map_err(storage)?,
                error_code: row.try_get("error_code").map_err(storage)?,
                error_message: row.try_get("error_message").map_err(storage)?,
            })
        })
        .transpose()
    }

    async fn idempotency_get(
        &self,
        scope: &str,
    ) -> Result<Option<StoredIdempotentResponse>, RepositoryError> {
        sqlx::query("SELECT fingerprint,status,body_json FROM idempotency_keys WHERE scope=$1")
            .bind(scope)
            .fetch_optional(&self.pool)
            .await
            .map_err(storage)?
            .map(|row| {
                Ok(StoredIdempotentResponse {
                    fingerprint: row.try_get("fingerprint").map_err(storage)?,
                    status: row
                        .try_get::<i32, _>("status")
                        .map_err(storage)?
                        .try_into()
                        .map_err(|_| RepositoryError::Storage("invalid status".into()))?,
                    body: row.try_get("body_json").map_err(storage)?,
                })
            })
            .transpose()
    }

    async fn idempotency_put(
        &self,
        scope: &str,
        fingerprint: &str,
        status: u16,
        body: &str,
        now: &str,
    ) -> Result<(), RepositoryError> {
        // ON CONFLICT DO NOTHING keeps the first response when retries race.
        sqlx::query(
            "INSERT INTO idempotency_keys(scope,fingerprint,status,body_json,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope) DO NOTHING",
        )
        .bind(scope)
        .bind(fingerprint)
        .bind(i32::from(status))
        .bind(body)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(storage)?;
        Ok(())
    }

    async fn seed_demo(&self, now: &str) -> Result<(), RepositoryError> {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts)")
            .fetch_one(&self.pool)
            .await
            .map_err(storage)?;
        if exists {
            return Ok(());
        }
        seed::seed(&self.pool, now).await
    }
}

pub(crate) async fn insert_candidate(
    pool: &PgPool,
    value: &CandidateProfile,
) -> Result<(), RepositoryError> {
    sqlx::query(
        "INSERT INTO candidates(id,alias,email,name,specialization,selected_grade,stack_json,team_role,experience_months,experience,soft_skills_json,processing_consent,publication_consent,verified_grade,verified_specialization,grade_confirmed_at,revision,updated_at) \
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
    )
    .bind(&value.id)
    .bind(&value.alias)
    .bind(&value.email)
    .bind(&value.name)
    .bind(specialization(value.specialization))
    .bind(grade(value.selected_grade))
    .bind(serde_json::to_string(&value.stack).map_err(json_storage)?)
    .bind(&value.team_role)
    .bind(value.experience_months.map(|v| v as i32))
    .bind(&value.experience)
    .bind(serde_json::to_string(&value.soft_skills).map_err(json_storage)?)
    .bind(value.consents.processing)
    .bind(value.consents.publication)
    .bind(value.verified_grade.map(grade))
    .bind(value.verified_specialization.map(specialization))
    .bind(&value.grade_confirmed_at)
    .bind(value.revision as i64)
    .bind(&value.updated_at)
    .execute(pool)
    .await
    .map_err(conflict)?;
    Ok(())
}

pub(crate) async fn update_candidate(
    pool: &PgPool,
    value: &CandidateProfile,
) -> Result<(), RepositoryError> {
    let changed = sqlx::query(
        "UPDATE candidates SET alias=$1,email=$2,name=$3,specialization=$4,selected_grade=$5,stack_json=$6,team_role=$7,experience_months=$8,experience=$9,soft_skills_json=$10,processing_consent=$11,publication_consent=$12,verified_grade=$13,verified_specialization=$14,grade_confirmed_at=$15,revision=$16,updated_at=$17 WHERE id=$18",
    )
    .bind(&value.alias)
    .bind(&value.email)
    .bind(&value.name)
    .bind(specialization(value.specialization))
    .bind(grade(value.selected_grade))
    .bind(serde_json::to_string(&value.stack).map_err(json_storage)?)
    .bind(&value.team_role)
    .bind(value.experience_months.map(|v| v as i32))
    .bind(&value.experience)
    .bind(serde_json::to_string(&value.soft_skills).map_err(json_storage)?)
    .bind(value.consents.processing)
    .bind(value.consents.publication)
    .bind(value.verified_grade.map(grade))
    .bind(value.verified_specialization.map(specialization))
    .bind(&value.grade_confirmed_at)
    .bind(value.revision as i64)
    .bind(&value.updated_at)
    .bind(&value.id)
    .execute(pool)
    .await
    .map_err(storage)?
    .rows_affected();
    if changed == 0 {
        return Err(RepositoryError::Storage("candidate not found".into()));
    }
    Ok(())
}

fn candidate_index(row: &PgRow) -> Result<CandidateIndexRecord, RepositoryError> {
    let profile = candidate_prefixed(row)?;
    let stored_skills: Option<String> = row.try_get("skills_json").map_err(storage)?;
    let skills = match stored_skills {
        Some(json) => parse_json(&json)?,
        None => profile
            .stack
            .iter()
            .map(|skill_id| fsp_domain::SkillEvidence {
                skill_id: skill_id.clone(),
                status: fsp_domain::EvidenceStatus::Observed,
                evidence_grade: None,
                sources: Vec::new(),
            })
            .collect(),
    };
    let work_modes = match row
        .try_get::<Option<String>, _>("work_modes_json")
        .map_err(storage)?
    {
        Some(json) => parse_json(&json)?,
        None => vec!["remote".to_string()],
    };
    let source_kinds = match row
        .try_get::<Option<String>, _>("source_kinds_json")
        .map_err(storage)?
    {
        Some(json) => parse_json(&json)?,
        None => Vec::new(),
    };
    Ok(CandidateIndexRecord {
        email_verified: row
            .try_get::<Option<bool>, _>("account_email_verified")
            .map_err(storage)?
            .unwrap_or(false),
        work_modes,
        available_for_offers: row
            .try_get::<Option<bool>, _>("available_for_offers")
            .map_err(storage)?
            .unwrap_or(false),
        skills,
        source_kinds,
        fsp_verified: row
            .try_get::<Option<bool>, _>("fsp_verified")
            .map_err(storage)?
            .unwrap_or(false),
        last_signal_at: row.try_get("last_signal_at").map_err(storage)?,
        profile,
    })
}

fn candidate_prefixed(row: &PgRow) -> Result<CandidateProfile, RepositoryError> {
    Ok(CandidateProfile {
        id: row.try_get("id").map_err(storage)?,
        alias: row.try_get("alias").map_err(storage)?,
        email: row.try_get("email").map_err(storage)?,
        name: row.try_get("name").map_err(storage)?,
        specialization: parse_specialization(
            &row.try_get::<String, _>("specialization")
                .map_err(storage)?,
        ),
        selected_grade: parse_grade(
            &row.try_get::<String, _>("selected_grade")
                .map_err(storage)?,
        ),
        stack: serde_json::from_str(&row.try_get::<String, _>("stack_json").map_err(storage)?)
            .unwrap_or_default(),
        team_role: row.try_get("team_role").map_err(storage)?,
        experience_months: row
            .try_get::<Option<i32>, _>("experience_months")
            .map_err(storage)?
            .map(|v| v as u32),
        experience: row.try_get("experience").map_err(storage)?,
        soft_skills: serde_json::from_str(
            &row.try_get::<String, _>("soft_skills_json")
                .map_err(storage)?,
        )
        .unwrap_or_default(),
        consents: Consents {
            processing: row.try_get("processing_consent").map_err(storage)?,
            publication: row.try_get("publication_consent").map_err(storage)?,
        },
        verified_grade: row
            .try_get::<Option<String>, _>("verified_grade")
            .map_err(storage)?
            .as_deref()
            .map(parse_grade),
        verified_specialization: row
            .try_get::<Option<String>, _>("verified_specialization")
            .map_err(storage)?
            .as_deref()
            .map(parse_specialization),
        grade_confirmed_at: row.try_get("grade_confirmed_at").map_err(storage)?,
        revision: row.try_get::<i64, _>("revision").map_err(storage)? as u64,
        updated_at: row.try_get("updated_at").map_err(storage)?,
    })
}

fn candidate(row: &PgRow) -> Result<CandidateProfile, RepositoryError> {
    candidate_prefixed(row)
}

fn account(row: &PgRow) -> Result<Account, RepositoryError> {
    Ok(Account {
        id: row.try_get("id").map_err(storage)?,
        email: row.try_get("email").map_err(storage)?,
        role: parse_role(row.try_get::<String, _>("role").map_err(storage)?.as_str()),
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        email_verified: row.try_get("email_verified").map_err(storage)?,
    })
}

fn need_record(row: &PgRow) -> Result<HiringNeedRecord, RepositoryError> {
    Ok(HiringNeedRecord {
        id: row.try_get("id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        title: row.try_get("title").map_err(storage)?,
        need: fsp_domain::HiringNeed {
            specialization: parse_specialization(
                &row.try_get::<String, _>("specialization")
                    .map_err(storage)?,
            ),
            grade: parse_grade(&row.try_get::<String, _>("grade").map_err(storage)?),
            requirements: parse_json(
                &row.try_get::<String, _>("requirements_json")
                    .map_err(storage)?,
            )?,
        },
        work_mode: row.try_get("work_mode").map_err(storage)?,
        salary_from: row.try_get::<i64, _>("salary_from").map_err(storage)? as u64,
        salary_to: row.try_get::<i64, _>("salary_to").map_err(storage)? as u64,
        description: row.try_get("description").map_err(storage)?,
        published: row.try_get("published").map_err(storage)?,
        published_at: row.try_get("published_at").map_err(storage)?,
        created_at: row.try_get("created_at").map_err(storage)?,
        updated_at: row.try_get("updated_at").map_err(storage)?,
        revision: row.try_get::<i64, _>("revision").map_err(storage)? as u64,
    })
}

fn shortlist_record(row: &PgRow) -> Result<fsp_domain::ShortlistRecord, RepositoryError> {
    Ok(fsp_domain::ShortlistRecord {
        id: row.try_get("id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        title: row.try_get("title").map_err(storage)?,
        member_ids: parse_json(&row.try_get::<String, _>("members_json").map_err(storage)?)?,
        created_at: row.try_get("created_at").map_err(storage)?,
        updated_at: row.try_get("updated_at").map_err(storage)?,
    })
}

fn invitation_record(row: &PgRow) -> Result<fsp_domain::InvitationRecord, RepositoryError> {
    let status: String = row.try_get("status").map_err(storage)?;
    Ok(fsp_domain::InvitationRecord {
        id: row.try_get("id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        candidate_alias: row.try_get("candidate_alias").map_err(storage)?,
        company: parse_json(&row.try_get::<String, _>("company_json").map_err(storage)?)?,
        need: parse_json(&row.try_get::<String, _>("need_json").map_err(storage)?)?,
        need_definition: parse_json(
            &row.try_get::<String, _>("need_definition_json")
                .map_err(storage)?,
        )?,
        message: row.try_get("message").map_err(storage)?,
        status: fsp_domain::InteractionStatus::parse(&status).ok_or_else(|| {
            RepositoryError::Storage(format!("unknown invitation status {status}"))
        })?,
        created_at: row.try_get("created_at").map_err(storage)?,
        viewed_at: row.try_get("viewed_at").map_err(storage)?,
        responded_at: row.try_get("responded_at").map_err(storage)?,
        disclosure_fields: parse_json(
            &row.try_get::<String, _>("disclosure_json")
                .map_err(storage)?,
        )?,
    })
}

fn application_record(row: &PgRow) -> Result<fsp_domain::ApplicationRecord, RepositoryError> {
    let status: String = row.try_get("status").map_err(storage)?;
    Ok(fsp_domain::ApplicationRecord {
        id: row.try_get("id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        candidate_alias: row.try_get("candidate_alias").map_err(storage)?,
        company: parse_json(&row.try_get::<String, _>("company_json").map_err(storage)?)?,
        vacancy: parse_json(&row.try_get::<String, _>("vacancy_json").map_err(storage)?)?,
        need_definition: parse_json(
            &row.try_get::<String, _>("need_definition_json")
                .map_err(storage)?,
        )?,
        message: row.try_get("message").map_err(storage)?,
        status: fsp_domain::InteractionStatus::parse(&status).ok_or_else(|| {
            RepositoryError::Storage(format!("unknown application status {status}"))
        })?,
        created_at: row.try_get("created_at").map_err(storage)?,
        viewed_at: row.try_get("viewed_at").map_err(storage)?,
        responded_at: row.try_get("responded_at").map_err(storage)?,
        disclosure_fields: parse_json(
            &row.try_get::<String, _>("disclosure_json")
                .map_err(storage)?,
        )?,
    })
}

fn disclosure_record(row: &PgRow) -> Result<fsp_domain::DisclosureRecord, RepositoryError> {
    Ok(fsp_domain::DisclosureRecord {
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        invitation_id: row.try_get("invitation_id").map_err(storage)?,
        application_id: row.try_get("application_id").map_err(storage)?,
        granted_at: row.try_get("granted_at").map_err(storage)?,
        name: row.try_get("name").map_err(storage)?,
        email: row.try_get("email").map_err(storage)?,
        source_links: parse_json(
            &row.try_get::<String, _>("source_links_json")
                .map_err(storage)?,
        )?,
    })
}

fn task_record(row: &PgRow) -> Result<fsp_domain::TaskRecord, RepositoryError> {
    let status: String = row.try_get("status").map_err(storage)?;
    Ok(fsp_domain::TaskRecord {
        id: row.try_get("id").map_err(storage)?,
        company_id: row.try_get("company_id").map_err(storage)?,
        title: row.try_get("title").map_err(storage)?,
        prompt: row.try_get("prompt").map_err(storage)?,
        skill_id: row.try_get("skill_id").map_err(storage)?,
        grade: parse_grade(&row.try_get::<String, _>("grade").map_err(storage)?),
        estimate_minutes: row.try_get::<i32, _>("estimate_minutes").map_err(storage)? as u32,
        status: fsp_domain::TaskStatus::parse(&status)
            .ok_or_else(|| RepositoryError::Storage(format!("unknown task status {status}")))?,
        created_at: row.try_get("created_at").map_err(storage)?,
    })
}

fn task_response_record(row: &PgRow) -> Result<fsp_domain::TaskResponseRecord, RepositoryError> {
    let mode: String = row.try_get("mode").map_err(storage)?;
    let status: String = row.try_get("status").map_err(storage)?;
    Ok(fsp_domain::TaskResponseRecord {
        id: row.try_get("id").map_err(storage)?,
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        candidate_alias: row.try_get("candidate_alias").map_err(storage)?,
        task: parse_json(&row.try_get::<String, _>("task_json").map_err(storage)?)?,
        mode: fsp_domain::TaskMode::parse(&mode)
            .ok_or_else(|| RepositoryError::Storage(format!("unknown task mode {mode}")))?,
        answer: row.try_get("answer").map_err(storage)?,
        status: fsp_domain::TaskResponseStatus::parse(&status).ok_or_else(|| {
            RepositoryError::Storage(format!("unknown task response status {status}"))
        })?,
        feedback: row.try_get("feedback").map_err(storage)?,
        submitted_at: row.try_get("submitted_at").map_err(storage)?,
        reviewed_at: row.try_get("reviewed_at").map_err(storage)?,
    })
}

fn assessment_record(row: &PgRow) -> Result<fsp_domain::AssessmentRecord, RepositoryError> {
    let status: String = row.try_get("status").map_err(storage)?;
    Ok(fsp_domain::AssessmentRecord {
        id: row.try_get("id").map_err(storage)?,
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        specialization: parse_specialization(
            &row.try_get::<String, _>("specialization")
                .map_err(storage)?,
        ),
        grade: parse_grade(&row.try_get::<String, _>("grade").map_err(storage)?),
        status: fsp_domain::AssessmentStatus::parse(&status).ok_or_else(|| {
            RepositoryError::Storage(format!("unknown assessment status {status}"))
        })?,
        task: parse_json(&row.try_get::<String, _>("task_json").map_err(storage)?)?,
        answer: parse_json(&row.try_get::<String, _>("answer_json").map_err(storage)?)?,
        checks: parse_json(&row.try_get::<String, _>("checks_json").map_err(storage)?)?,
        result: row
            .try_get::<Option<String>, _>("result_json")
            .map_err(storage)?
            .map(|json| parse_json(&json))
            .transpose()?,
        created_at: row.try_get("created_at").map_err(storage)?,
        updated_at: row.try_get("updated_at").map_err(storage)?,
        revision: row.try_get::<i64, _>("revision").map_err(storage)? as u64,
    })
}

fn source_record(row: &PgRow) -> Result<SourceRecord, RepositoryError> {
    Ok(SourceRecord {
        id: row.try_get("id").map_err(storage)?,
        candidate_id: row.try_get("candidate_id").map_err(storage)?,
        provider: parse_source_provider(&row.try_get::<String, _>("provider").map_err(storage)?),
        synthetic: row.try_get("synthetic").map_err(storage)?,
        active_job_id: row.try_get("active_job_id").map_err(storage)?,
        account_label: row.try_get("account_label").map_err(storage)?,
        last_synced_at: row.try_get("last_synced_at").map_err(storage)?,
        analysis: row
            .try_get::<Option<String>, _>("analysis_json")
            .map_err(storage)?
            .map(|json| parse_json(&json))
            .transpose()?,
        verified_participation: row.try_get("verified_participation").map_err(storage)?,
        competition_ids: parse_json(
            &row.try_get::<String, _>("competition_ids_json")
                .map_err(storage)?,
        )?,
    })
}

fn parse_json<T: DeserializeOwned>(value: &str) -> Result<T, RepositoryError> {
    serde_json::from_str(value)
        .map_err(|error| RepositoryError::Storage(format!("stored json is invalid: {error}")))
}

fn json_storage(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Storage(error.to_string())
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
fn source_provider(value: fsp_domain::SourceProvider) -> &'static str {
    match value {
        fsp_domain::SourceProvider::Github => "github",
        fsp_domain::SourceProvider::Fsp => "fsp",
    }
}
fn parse_source_provider(value: &str) -> fsp_domain::SourceProvider {
    if value == "fsp" {
        fsp_domain::SourceProvider::Fsp
    } else {
        fsp_domain::SourceProvider::Github
    }
}

fn storage(error: sqlx::Error) -> RepositoryError {
    RepositoryError::Storage(error.to_string())
}

fn conflict(error: sqlx::Error) -> RepositoryError {
    match error {
        sqlx::Error::Database(ref inner) if inner.code().as_deref() == Some("23505") => {
            RepositoryError::Conflict
        }
        other => storage(other),
    }
}
