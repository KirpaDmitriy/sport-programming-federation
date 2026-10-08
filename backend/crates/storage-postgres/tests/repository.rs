//! Repository tests against a real PostgreSQL database. Each test gets an
//! isolated `fsp_test_*` database; `FSP_TEST_DATABASE_URL` must point at an
//! admin connection (the `just db-up` service or the CI service container).

use std::sync::Arc;

use fsp_application::{
    CandidateSearch, EmailChallengeInput, EmailVerifyInput, IdempotencyClaim, PlatformRepository,
    PlatformService, ProfilePatch, VerificationDelivery,
};
use fsp_domain::{
    Criticality, EvidencePolicy, Grade, HiringNeed, HiringNeedRecord, Requirement, Role,
    Specialization,
};
use fsp_storage_postgres::PostgresRepository;

fn admin_url() -> String {
    std::env::var("FSP_TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://fsp:fsp@127.0.0.1:5434/postgres".into())
}

struct FixedDelivery;

#[async_trait::async_trait]
impl VerificationDelivery for FixedDelivery {
    fn code_for(&self) -> String {
        "123456".into()
    }

    async fn deliver(&self, _: &str, _: &str) -> Result<(), fsp_application::IntegrationError> {
        Ok(())
    }

    fn contract_name(&self) -> &'static str {
        "mock_mailbox"
    }
}

async fn repository() -> (PostgresRepository, fsp_storage_postgres::TestDatabase) {
    PostgresRepository::connect_test_database(&admin_url()).await
}

#[tokio::test(flavor = "current_thread")]
async fn login_session_and_profile_survive_reconnect() {
    let (repository, database) = repository().await;
    let service = PlatformService::new(Arc::new(repository), Arc::new(FixedDelivery));
    let challenge = service
        .request_challenge(EmailChallengeInput {
            email: "New.Candidate@example.com".into(),
            role: Role::Candidate,
        })
        .await
        .expect("challenge is created");
    let wrong = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id.clone(),
            code: "000000".into(),
        })
        .await
        .expect_err("wrong code is rejected");
    assert_eq!(wrong.code, "invalid_code");

    let (session, token) = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id.clone(),
            code: "123456".into(),
        })
        .await
        .expect("correct code creates a session");
    assert_eq!(session.role, Role::Candidate);
    assert!(session.email_verified);
    let reused = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id,
            code: "123456".into(),
        })
        .await
        .expect_err("a challenge is one-time");
    assert_eq!(reused.code, "challenge_used");
    drop(service);

    let reopened = PlatformService::new(
        Arc::new(
            PostgresRepository::connect(&database.url)
                .await
                .expect("database reconnects"),
        ),
        Arc::new(FixedDelivery),
    );
    let restored = reopened.session(&token).await.expect("session persists");
    let profile = reopened.profile(&restored).await.expect("profile persists");
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
        .await
        .expect("frontend profile payload is accepted");
    assert_eq!(updated.name, "Мария Волкова");
    let empty_patch = reopened
        .update_profile(&restored, ProfilePatch::default())
        .await
        .expect_err("empty profile patches violate the contract");
    assert_eq!(empty_patch.code, "validation_error");

    let mismatch = reopened
        .request_challenge(EmailChallengeInput {
            email: "new.candidate@example.com".into(),
            role: Role::Employer,
        })
        .await
        .expect_err("an account cannot change role during login");
    assert_eq!(mismatch.code, "role_mismatch");
}

#[tokio::test(flavor = "current_thread")]
async fn seeded_recommendations_use_the_recorded_deterministic_order() {
    let (repository, _database) = repository().await;
    let service = PlatformService::new(Arc::new(repository), Arc::new(FixedDelivery));
    service.initialize().await.expect("demo data is seeded");
    let challenge = service
        .request_challenge(EmailChallengeInput {
            email: "hr@sever-tech.example".into(),
            role: Role::Employer,
        })
        .await
        .expect("employer challenge is created");
    let (session, _) = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id,
            code: "123456".into(),
        })
        .await
        .expect("employer session is created");
    let page = service
        .candidate_search(
            &session,
            CandidateSearch {
                need_id: Some("need-001".into()),
                recommended: true,
                page: 1,
                page_size: 10,
                ..CandidateSearch::default()
            },
        )
        .await
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
}

#[tokio::test(flavor = "current_thread")]
async fn idempotency_keys_round_trip_and_keep_the_first_response() {
    let (repository, _database) = repository().await;

    let tx = repository.transaction().await.unwrap();
    let claim = tx
        .idempotency_claim("actor:op:/path:key-0001", "{\"a\":1}")
        .await
        .unwrap();
    assert!(matches!(claim, IdempotencyClaim::Execute));
    let second = repository.transaction().await.unwrap();
    // The competing transaction waits until both the effect and response commit.
    let pending = second.idempotency_claim("actor:op:/path:key-0001", "{\"a\":1}");
    tokio::pin!(pending);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), &mut pending)
            .await
            .is_err()
    );
    tx.idempotency_finish("actor:op:/path:key-0001", 201, "{\"id\":\"one\"}")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let IdempotencyClaim::Stored(stored) = pending.await.unwrap() else {
        panic!("finished scope replays the stored response");
    };
    assert_eq!(stored.fingerprint, "{\"a\":1}");
    assert_eq!(stored.status, 201);
    assert_eq!(stored.body, "{\"id\":\"one\"}");
}

#[tokio::test(flavor = "current_thread")]
async fn idempotent_command_and_claim_roll_back_if_response_cannot_be_stored() {
    struct Unserializable;
    impl serde::Serialize for Unserializable {
        fn serialize<S: serde::Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
            Err(serde::ser::Error::custom(
                "injected response serialization failure",
            ))
        }
    }
    let (repository, _database) = repository().await;
    let repository = Arc::new(repository);
    let service = PlatformService::new(repository.clone(), Arc::new(FixedDelivery));
    service.initialize().await.unwrap();
    let challenge = service
        .request_challenge(EmailChallengeInput {
            email: "hr@sever-tech.example".into(),
            role: Role::Employer,
        })
        .await
        .unwrap();
    let (session, _) = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id,
            code: "123456".into(),
        })
        .await
        .unwrap();
    let body = serde_json::json!({"candidateId":"candidate018", "needId":"need-001", "message":"Предложение"});
    let context = || fsp_application::IdempotencyContext {
        operation: "createInvitation",
        path: "/api/v1/invitations",
        key: "rollback-test",
        body: &body,
        status: 201,
    };
    let before = repository
        .invitations(session.company_id.as_deref().unwrap())
        .await
        .unwrap()
        .len();
    let command_session = &session;
    let input = serde_json::from_value(body.clone()).unwrap();
    let result = service
        .idempotent(&session, context(), |commands| async move {
            commands.create_invitation(command_session, input).await?;
            Ok(Unserializable)
        })
        .await;
    assert!(matches!(result, Err(error) if error.code == "internal_error"));
    assert_eq!(
        repository
            .invitations(session.company_id.as_deref().unwrap())
            .await
            .unwrap()
            .len(),
        before
    );
    let claims: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM idempotency_keys")
        .fetch_one(repository.pool())
        .await
        .unwrap();
    assert_eq!(claims, 0);
    let input = serde_json::from_value(body.clone()).unwrap();
    let result = service
        .idempotent(&session, context(), |commands| async move {
            commands.create_invitation(command_session, input).await
        })
        .await
        .unwrap();
    assert!(matches!(result, fsp_application::Idempotent::Fresh(_)));
    assert_eq!(
        repository
            .invitations(session.company_id.as_deref().unwrap())
            .await
            .unwrap()
            .len(),
        before + 1
    );
}

#[tokio::test(flavor = "current_thread")]
async fn source_ingestion_updates_evidence_without_inventing_or_overwriting_grades() {
    struct GitHub;
    #[async_trait::async_trait]
    impl fsp_application::GitHubGateway for GitHub {
        fn authorization_url(
            &self,
            _: &str,
            _: &str,
        ) -> Result<String, fsp_application::IntegrationError> {
            unreachable!()
        }
        async fn exchange_code(
            &self,
            _: &str,
        ) -> Result<String, fsp_application::IntegrationError> {
            unreachable!()
        }
        async fn analyze(
            &self,
            username: &str,
            _: &str,
        ) -> Result<fsp_domain::GitHubAnalysis, fsp_application::IntegrationError> {
            Ok(fsp_domain::GitHubAnalysis {
                username: username.into(),
                active_days: 2,
                observed_from: None,
                observed_to: None,
                repositories: vec![fsp_domain::AnalyzedRepository {
                    id: "repo-1".into(),
                    name: "project".into(),
                    url: "https://github.com/owner/project".into(),
                    technologies: vec!["rust".into(), "react".into()],
                    metrics: fsp_domain::RepositoryMetrics {
                        stars: 1,
                        forks: 0,
                        open_issues: 0,
                        size_kib: 5,
                        pushed_at: None,
                    },
                }],
            })
        }
    }
    let (repository, _database) = repository().await;
    let repository = Arc::new(repository);
    let service = PlatformService::new(repository.clone(), Arc::new(FixedDelivery))
        .with_github(Arc::new(GitHub));
    service.initialize().await.unwrap();
    let challenge = service
        .request_challenge(EmailChallengeInput {
            email: "alexey@example.com".into(),
            role: Role::Candidate,
        })
        .await
        .unwrap();
    let (session, _) = service
        .verify_email(EmailVerifyInput {
            challenge_id: challenge.challenge_id,
            code: "123456".into(),
        })
        .await
        .unwrap();
    let id = session.candidate_id.as_deref().unwrap();
    repository.save_github_token(id, "fixture").await.unwrap();
    let before = repository.candidate_index(id).await.unwrap().unwrap();
    let source = service
        .connect_source(
            &session,
            "github",
            fsp_application::SourceConnectInput {
                account: "owner".into(),
            },
        )
        .await
        .unwrap();
    let connected = repository.candidate_index(id).await.unwrap().unwrap();
    assert_eq!(
        connected.profile.verified_grade,
        before.profile.verified_grade
    );
    assert!(
        connected
            .source_kinds
            .contains(&fsp_domain::EvidenceSource::Github)
    );
    let rust = connected
        .skills
        .iter()
        .find(|skill| skill.skill_id == "rust")
        .unwrap();
    assert!(rust.sources.contains(&fsp_domain::EvidenceSource::Github));
    assert_eq!(
        rust.evidence_grade,
        before
            .skills
            .iter()
            .find(|skill| skill.skill_id == "rust")
            .unwrap()
            .evidence_grade
    );
    let react = connected
        .skills
        .iter()
        .find(|skill| skill.skill_id == "react")
        .unwrap();
    assert_eq!(react.status, fsp_domain::EvidenceStatus::Evidence);
    assert_eq!(react.evidence_grade, None);
    let job = service.sync_source(&session, &source.id).await.unwrap();
    assert_eq!(job.status, "succeeded");
    let synced = repository.candidate_index(id).await.unwrap().unwrap();
    assert_eq!(synced.skills, connected.skills);
    assert_eq!(synced.profile.verified_grade, before.profile.verified_grade);
}

#[tokio::test(flavor = "current_thread")]
async fn corrupt_profile_json_is_reported_instead_of_silently_erased() {
    let (repository, _database) = repository().await;
    repository.seed_demo("2026-10-05T00:00:00Z").await.unwrap();
    sqlx::query("UPDATE candidates SET soft_skills_json='not-json' WHERE id='candidate024'")
        .execute(repository.pool())
        .await
        .unwrap();
    assert!(repository.candidate("candidate024").await.is_err());
    assert!(repository.candidate_index("candidate024").await.is_err());
}

#[tokio::test(flavor = "current_thread")]
async fn shortlists_round_trip_and_stay_scoped_to_the_company() {
    let (repository, _database) = repository().await;
    sqlx::query(
        "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES('company-sever','Север Тех','Разработка','','hr@sever-tech.example',NULL)",
    )
    .execute(repository.pool())
    .await
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
        .await
        .expect("shortlist is stored");

    let stored = repository
        .shortlist("company-sever", "shortlist-test")
        .await
        .expect("lookup works")
        .expect("shortlist exists");
    assert_eq!(stored.member_ids, ["candidate018"]);
    assert!(
        repository
            .shortlist("company-other", "shortlist-test")
            .await
            .expect("lookup works")
            .is_none()
    );
    assert_eq!(
        repository
            .shortlists("company-sever")
            .await
            .expect("list works")
            .len(),
        1
    );

    repository
        .delete_shortlist("company-sever", "shortlist-test")
        .await
        .expect("shortlist is removed");
    assert!(
        repository
            .shortlists("company-sever")
            .await
            .expect("list works")
            .is_empty()
    );
}

#[tokio::test(flavor = "current_thread")]
async fn invitations_and_disclosures_round_trip() {
    let (repository, _database) = repository().await;
    repository
        .seed_demo("2026-10-06T00:00:00Z")
        .await
        .expect("demo data is seeded");
    sqlx::query(
        "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES('company-sever','Север Тех','Разработка','','hr@sever-tech.example',NULL)",
    )
    .execute(repository.pool())
    .await
    .expect("company is stored");
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
        .await
        .expect("invitation is stored");

    let stored = repository
        .invitation("invitation-test")
        .await
        .expect("lookup works")
        .expect("invitation exists");
    assert_eq!(stored.status, fsp_domain::InteractionStatus::Sent);
    assert_eq!(stored.need.id, "need-test");
    assert_eq!(stored.need_definition.id, "need-test");
    assert_eq!(
        repository.invitations("company-sever").await.unwrap().len(),
        1
    );
    assert_eq!(
        repository
            .candidate_invitations("candidate018")
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(
        repository
            .candidate_invitations("candidate031")
            .await
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
        .await
        .expect("disclosure is stored");
    let grant = repository
        .disclosure("company-sever", "candidate018")
        .await
        .expect("lookup works")
        .expect("grant exists");
    assert_eq!(grant.name.as_deref(), Some("Илья Соколов"));
    assert!(grant.email.is_none());
    assert_eq!(grant.source_links, ["https://github.com/example"]);

    repository
        .delete_disclosure("company-sever", "candidate018")
        .await
        .expect("disclosure is removed");
    assert!(
        repository
            .disclosure("company-sever", "candidate018")
            .await
            .expect("lookup works")
            .is_none()
    );
}

#[tokio::test(flavor = "current_thread")]
async fn tasks_and_responses_round_trip_and_stay_scoped() {
    let (repository, _database) = repository().await;
    repository
        .seed_demo("2026-10-06T00:00:00Z")
        .await
        .expect("demo data is seeded");
    sqlx::query(
        "INSERT INTO companies(id,display_name,business_area,description,contact_email,website) VALUES('company-sever','Север Тех','Разработка','','hr@sever-tech.example',NULL)",
    )
    .execute(repository.pool())
    .await
    .expect("company is stored");

    repository
        .save_task(&fsp_domain::TaskRecord {
            id: "task-test".into(),
            company_id: "company-sever".into(),
            title: "Задание".into(),
            prompt: "Опишите подход".into(),
            skill_id: "rust".into(),
            grade: Grade::Middle,
            estimate_minutes: 45,
            status: fsp_domain::TaskStatus::Active,
            created_at: "2026-10-06T00:00:00Z".into(),
        })
        .await
        .expect("task is stored");
    let stored = repository
        .task("task-test")
        .await
        .expect("lookup works")
        .expect("task exists");
    assert_eq!(stored.status, fsp_domain::TaskStatus::Active);
    assert_eq!(stored.grade, Grade::Middle);
    assert!(
        repository
            .active_tasks()
            .await
            .expect("active list works")
            .iter()
            .any(|task| task.id == "task-test")
    );

    repository
        .save_task_response(&fsp_domain::TaskResponseRecord {
            id: "task-response-test".into(),
            candidate_id: "candidate018".into(),
            candidate_alias: "Кандидат №018".into(),
            task: fsp_domain::OfferedTaskSnapshot {
                id: "task-test".into(),
                company_id: "company-sever".into(),
                company_display_name: "Север Тех".into(),
                title: "Задание".into(),
                prompt: "Опишите подход".into(),
                skill_id: "rust".into(),
                grade: Grade::Middle,
                estimate_minutes: 45,
            },
            mode: fsp_domain::TaskMode::Approach,
            answer: "Ответ".into(),
            status: fsp_domain::TaskResponseStatus::Submitted,
            feedback: None,
            submitted_at: "2026-10-06T12:00:00Z".into(),
            reviewed_at: None,
        })
        .await
        .expect("response is stored");
    let response = repository
        .task_response("task-response-test")
        .await
        .expect("lookup works")
        .expect("response exists");
    assert_eq!(response.task.id, "task-test");
    assert_eq!(response.task.company_display_name, "Север Тех");
    assert_eq!(
        repository
            .candidate_task_responses("candidate018")
            .await
            .expect("candidate list works")
            .len(),
        1
    );
    assert_eq!(
        repository
            .company_task_responses("company-sever")
            .await
            .expect("company list works")
            .len(),
        1
    );
    assert!(
        repository
            .company_task_responses("company-other")
            .await
            .expect("other company list works")
            .is_empty()
    );
}

#[tokio::test(flavor = "current_thread")]
async fn assessments_and_jobs_round_trip_with_persisted_results() {
    let (repository, _database) = repository().await;
    repository
        .seed_demo("2026-10-06T00:00:00Z")
        .await
        .expect("demo data is seeded");

    repository
        .save_assessment(&fsp_domain::AssessmentRecord {
            id: "assessment-test".into(),
            candidate_id: "candidate024".into(),
            specialization: Specialization::Backend,
            grade: Grade::Middle,
            status: fsp_domain::AssessmentStatus::InProgress,
            task: fsp_domain::AssessmentTask {
                id: "task-idempotency-v1".into(),
                family: "idempotent-api".into(),
                version: "1".into(),
                variant_id: "orders-middle-a".into(),
                title: "Задание".into(),
                prompt: "Опишите подход".into(),
                language: "rust".into(),
                starter_code: "todo!()".into(),
                acceptance_criteria: vec!["Первый запрос создаёт заказ".into()],
                rubric: vec![fsp_domain::RubricCriterion {
                    id: "correctness".into(),
                    label: "Корректность".into(),
                    weight: 4,
                }],
                ai_allowed: true,
                external_ai_allowed: true,
                execution: "simulated".into(),
                questions: vec![],
            },
            answer: fsp_domain::AssessmentAnswer {
                code: "todo!()".into(),
                explanation: "Ответ".into(),
                external_ai_used: false,
                responses: vec![],
            },
            checks: vec![fsp_domain::AssessmentCheck {
                id: "check-1".into(),
                label: "Проверка".into(),
                status: "passed".into(),
                message: "Успешно".into(),
            }],
            result: None,
            created_at: "2026-10-06T00:00:00Z".into(),
            updated_at: "2026-10-06T01:00:00Z".into(),
            revision: 3,
        })
        .await
        .expect("assessment is stored");
    let stored = repository
        .assessment("assessment-test")
        .await
        .expect("lookup works")
        .expect("assessment exists");
    assert_eq!(stored.status, fsp_domain::AssessmentStatus::InProgress);
    assert_eq!(stored.revision, 3);
    assert_eq!(stored.task.variant_id, "orders-middle-a");
    assert_eq!(stored.checks.len(), 1);
    assert_eq!(
        repository
            .candidate_assessments("candidate024")
            .await
            .expect("candidate list works")
            .len(),
        1
    );
    assert!(
        repository
            .candidate_assessments("candidate-999")
            .await
            .expect("other candidate list works")
            .is_empty()
    );

    repository
        .save_job(&fsp_domain::JobRecord {
            id: "job-assessment".into(),
            owner_id: "candidate024".into(),
            kind: "assessment".into(),
            status: "succeeded".into(),
            candidate_id: Some("candidate024".into()),
            assessment_id: Some("assessment-test".into()),
            input_revision: Some(3),
            result_json: Some("{\"kind\":\"assessment\",\"ok\":true}".into()),
            confirmed: false,
            created_at: "2026-10-06T00:00:00Z".into(),
            updated_at: "2026-10-06T01:00:00Z".into(),
            result_source_id: None,
            error_code: None,
            error_message: None,
        })
        .await
        .expect("job is stored");
    let job = repository
        .job("candidate024", "job-assessment")
        .await
        .expect("lookup works")
        .expect("job exists");
    assert_eq!(job.kind, "assessment");
    assert_eq!(job.input_revision, Some(3));
    assert_eq!(
        job.result_json.as_deref(),
        Some("{\"kind\":\"assessment\",\"ok\":true}")
    );
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

#[tokio::test]
async fn rollback_accepts_future_additive_schema_but_rejects_corrupt_history() {
    use sqlx::migrate::{Migrate, Migration, MigrationType};
    use std::borrow::Cow;

    let (repository, database) = repository().await;
    let mut connection = repository.pool().acquire().await.unwrap();
    let future = Migration::new(
        9000,
        Cow::Borrowed("future additive fixture"),
        MigrationType::Simple,
        Cow::Borrowed(
            "CREATE TABLE future_release_data (value text NOT NULL); INSERT INTO future_release_data VALUES ('preserved');",
        ),
        false,
    );
    connection.apply(&future).await.unwrap();
    drop(connection);
    let reopened = PostgresRepository::connect(&database.url).await.unwrap();
    let value: String = sqlx::query_scalar("SELECT value FROM future_release_data")
        .fetch_one(reopened.pool())
        .await
        .unwrap();
    assert_eq!(value, "preserved");
    reopened.pool().close().await;

    sqlx::query("UPDATE _sqlx_migrations SET success = false WHERE version = 9000")
        .execute(repository.pool())
        .await
        .unwrap();
    let error = PostgresRepository::connect(&database.url)
        .await
        .err()
        .unwrap();
    assert!(format!("{error:?}").contains("partially applied"));
    sqlx::query("UPDATE _sqlx_migrations SET success = true WHERE version = 9000")
        .execute(repository.pool())
        .await
        .unwrap();

    // An unknown version within the binary's history must not be silently ignored.
    sqlx::query("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (0, 'unknown old migration', true, '\\x00', 0)")
        .execute(repository.pool()).await.unwrap();
    let error = PostgresRepository::connect(&database.url)
        .await
        .err()
        .unwrap();
    assert!(format!("{error:?}").contains("migration 0 was previously applied but is missing"));
    sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 0")
        .execute(repository.pool())
        .await
        .unwrap();

    sqlx::query("UPDATE _sqlx_migrations SET checksum = '\\x00' WHERE version = 1")
        .execute(repository.pool())
        .await
        .unwrap();
    let error = PostgresRepository::connect(&database.url)
        .await
        .err()
        .unwrap();
    assert!(format!("{error:?}").contains("modified"));
    repository.pool().close().await;
}
