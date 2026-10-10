//! Source ingestion and its transactionally derived candidate evidence.
//!
//! The ФСП source completes inline. A GitHub analysis runs for minutes in the insights service, so
//! its source sync is a job that advances whenever it is polled.
use super::*;
use crate::{GitHubAnalysisView, GitHubInsights, InsightsStatus};

/// A GitHub analysis that has not finished by then is reported as failed.
const GITHUB_JOB_TIMEOUT_MINUTES: i64 = 90;

impl PlatformService {
    pub async fn connect_source(
        &self,
        session: &SessionView,
        provider: &str,
        input: SourceConnectInput,
    ) -> Result<SourceView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        self.require_processing_consent(candidate_id).await?;
        let account = input.account.trim();
        if account.is_empty() || account.len() > 100 {
            return Err(validation("Проверьте идентификатор аккаунта"));
        }
        if provider == "fsp"
            && !account
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
        {
            return Err(validation(
                "Используйте буквы, цифры, дефис или подчёркивание в ФСП ID",
            ));
        }
        if provider == "github" {
            return self.connect_github(candidate_id, account).await;
        }
        let record = match provider {
            "fsp" => {
                let participation = self
                    .fsp
                    .as_ref()
                    .ok_or_else(|| {
                        ApplicationError::new(503, "fsp_not_configured", "Источник ФСП недоступен")
                    })?
                    .participation(account)
                    .await
                    .map_err(integration_error)?;
                fsp_domain::SourceRecord {
                    id: format!("source-fsp-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    provider: fsp_domain::SourceProvider::Fsp,
                    synthetic: true,
                    active_job_id: None,
                    account_label: Some(participation.account_label),
                    last_synced_at: Some(now()),
                    analysis: None,
                    verified_participation: participation.verified,
                    competition_ids: participation.competition_ids,
                    fsp_results: participation.results,
                }
            }
            _ => {
                return Err(ApplicationError::new(
                    404,
                    "not_found",
                    "Источник не найден",
                ));
            }
        };
        let tx = self
            .repository
            .transaction()
            .await
            .map_err(ApplicationError::storage)?;
        tx.lock_candidate(candidate_id)
            .await
            .map_err(ApplicationError::storage)?;
        let scoped = Self {
            repository: tx.share(),
            ..self.clone()
        };
        scoped.require_processing_consent(candidate_id).await?;
        let mut candidate = scoped.candidate_index(candidate_id).await?;
        scoped.save_source_evidence(&mut candidate, &record).await?;
        tx.commit().await.map_err(ApplicationError::storage)?;
        Ok(source_view(
            record,
            &self.github_ownership_code(candidate_id),
            None,
        ))
    }

    pub async fn sync_source(
        &self,
        session: &SessionView,
        source_id: &str,
    ) -> Result<JobView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        self.require_processing_consent(candidate_id).await?;
        let source = self
            .repository
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.id == source_id)
            .ok_or_else(|| ApplicationError::new(404, "not_found", "Источник не найден"))?;
        // The ФСП adapter completes inline. No persistent running marker is published,
        // so a process crash cannot strand its job.
        let expected_source = source.clone();
        let mut job = running_job(candidate_id, "source_sync");
        let result = match source.provider {
            fsp_domain::SourceProvider::Github => {
                return self.sync_github(candidate_id, source).await;
            }
            fsp_domain::SourceProvider::Fsp => {
                let account = source.account_label.as_deref().ok_or_else(|| {
                    ApplicationError::new(
                        409,
                        "source_not_connected",
                        "Сначала подключите источник",
                    )
                })?;
                self.fsp
                    .as_ref()
                    .ok_or_else(|| {
                        ApplicationError::new(503, "fsp_not_configured", "Источник ФСП недоступен")
                    })?
                    .participation(account)
                    .await
                    .map(|participation| fsp_domain::SourceRecord {
                        account_label: Some(participation.account_label),
                        verified_participation: participation.verified,
                        competition_ids: participation.competition_ids,
                        fsp_results: participation.results,
                        last_synced_at: Some(now()),
                        active_job_id: None,
                        ..source
                    })
                    .map_err(integration_error)
            }
        };
        match result {
            Ok(updated) => {
                // The refreshed source and the succeeded job commit together.
                let tx = self
                    .repository
                    .transaction()
                    .await
                    .map_err(ApplicationError::storage)?;
                tx.lock_candidate(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?;
                let scoped = Self {
                    repository: tx.share(),
                    ..self.clone()
                };
                let mut candidate = scoped.candidate_index(candidate_id).await?;
                let current = tx
                    .sources(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?
                    .into_iter()
                    .find(|source| source.id == expected_source.id);
                let failure = if !candidate.profile.consents.processing {
                    Some((
                        "processing_consent_revoked",
                        "Согласие на обработку отозвано",
                    ))
                } else if current.as_ref() != Some(&expected_source) {
                    Some(("stale_input", "Источник изменился во время синхронизации"))
                } else {
                    None
                };
                if let Some((code, message)) = failure {
                    job.status = "failed".into();
                    job.error_code = Some(code.into());
                    job.error_message = Some(message.into());
                    job.updated_at = now();
                    tx.save_job(&job).await.map_err(ApplicationError::storage)?;
                    tx.commit().await.map_err(ApplicationError::storage)?;
                    return Ok(job_view(job, None));
                }
                scoped
                    .save_source_evidence(&mut candidate, &updated)
                    .await?;
                job.status = "succeeded".into();
                job.updated_at = now();
                job.result_source_id = Some(updated.id.clone());
                job.result_json = Some(
                    serde_json::to_string(&JobResultView::SourceSync {
                        source: source_view(
                            updated.clone(),
                            &self.github_ownership_code(candidate_id),
                            None,
                        ),
                    })
                    .map_err(|_| {
                        ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
                    })?,
                );
                tx.save_job(&job).await.map_err(ApplicationError::storage)?;
                tx.commit().await.map_err(ApplicationError::storage)?;
                let view = source_view(updated, &self.github_ownership_code(candidate_id), None);
                Ok(job_view(job, Some(view)))
            }
            Err(error) => {
                job.status = "failed".into();
                job.updated_at = now();
                job.error_code = Some(error.code.into());
                job.error_message = Some(error.message);
                self.repository
                    .save_job(&job)
                    .await
                    .map_err(ApplicationError::storage)?;
                Ok(job_view(job, None))
            }
        }
    }

    /// Connects a GitHub account by login or profile link and starts its public analysis.
    ///
    /// A finished analysis applies at once. Otherwise the source records a running job, and every
    /// poll of that job asks the analysis service and applies the report once it is ready.
    async fn connect_github(
        &self,
        candidate_id: &str,
        account: &str,
    ) -> Result<SourceView, ApplicationError> {
        let login = fsp_domain::parse_github_login(account).ok_or_else(|| {
            ApplicationError::new(
                422,
                "github_login_invalid",
                "Укажите имя пользователя GitHub или ссылку на профиль",
            )
        })?;
        let code = self.github_ownership_code(candidate_id);
        let previous = self.github_source(candidate_id).await?;
        let status = self
            .github_insights()?
            .submit(&login, Some(&code), false)
            .await
            .map_err(integration_error)?;
        let (record, progress, job) = match status {
            InsightsStatus::Failed(error) => return Err(integration_error(error)),
            InsightsStatus::Done(insights) => (
                self.github_record(candidate_id, previous.as_ref(), *insights)
                    .await?,
                None,
                None,
            ),
            InsightsStatus::Pending {
                queued,
                stage,
                progress,
            } => {
                let job = running_job(candidate_id, "source_sync");
                // The previous report stays visible only while the same account is re-analyzed.
                let previous = previous.filter(|source| {
                    source
                        .account_label
                        .as_deref()
                        .is_some_and(|label| label.eq_ignore_ascii_case(&login))
                });
                let record = fsp_domain::SourceRecord {
                    id: format!("source-github-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    provider: fsp_domain::SourceProvider::Github,
                    synthetic: false,
                    active_job_id: Some(job.id.clone()),
                    account_label: Some(login),
                    last_synced_at: previous
                        .as_ref()
                        .and_then(|source| source.last_synced_at.clone()),
                    analysis: previous.and_then(|source| source.analysis),
                    verified_participation: false,
                    competition_ids: Vec::new(),
                    fsp_results: Vec::new(),
                };
                (
                    record,
                    Some(analysis_view(queued, stage, progress)),
                    Some(job),
                )
            }
        };
        let tx = self
            .repository
            .transaction()
            .await
            .map_err(ApplicationError::storage)?;
        tx.lock_candidate(candidate_id)
            .await
            .map_err(ApplicationError::storage)?;
        let scoped = Self {
            repository: tx.share(),
            ..self.clone()
        };
        scoped.require_processing_consent(candidate_id).await?;
        // The analysis this connection replaces can no longer apply: its job fails as stale.
        let replaced = tx
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.provider == fsp_domain::SourceProvider::Github)
            .and_then(|source| source.active_job_id);
        if let Some(replaced) = replaced
            && let Some(mut stale) = tx
                .job(candidate_id, &replaced)
                .await
                .map_err(ApplicationError::storage)?
                .filter(|stale| stale.status == "running")
        {
            stale.status = "failed".into();
            stale.updated_at = now();
            stale.error_code = Some("stale_input".into());
            stale.error_message = Some("Источник изменился во время синхронизации".into());
            tx.save_job(&stale)
                .await
                .map_err(ApplicationError::storage)?;
        }
        let mut candidate = scoped.candidate_index(candidate_id).await?;
        scoped.save_source_evidence(&mut candidate, &record).await?;
        if let Some(job) = &job {
            tx.save_job(job).await.map_err(ApplicationError::storage)?;
        }
        tx.commit().await.map_err(ApplicationError::storage)?;
        Ok(source_view(record, &code, progress))
    }

    /// Updates a connected GitHub account; a running analysis is followed, not restarted.
    ///
    /// The insights service reuses a report younger than six hours and re-reads the bio, so an
    /// ownership check right after adding the code takes seconds; older reports are rebuilt.
    async fn sync_github(
        &self,
        candidate_id: &str,
        source: fsp_domain::SourceRecord,
    ) -> Result<JobView, ApplicationError> {
        let login = source.account_label.clone().ok_or_else(|| {
            ApplicationError::new(409, "source_not_connected", "Сначала подключите источник")
        })?;
        if let Some(job_id) = source.active_job_id.as_deref()
            && let Some(job) = self
                .repository
                .job(candidate_id, job_id)
                .await
                .map_err(ApplicationError::storage)?
            && job.status == "running"
        {
            return Ok(job_view(job, None));
        }
        // A configuration gap is a request error; provider failures become a failed job.
        let gateway = self.github_insights()?;
        let job = running_job(candidate_id, "source_sync");
        let code = self.github_ownership_code(candidate_id);
        match gateway.submit(&login, Some(&code), false).await {
            Err(error) | Ok(InsightsStatus::Failed(error)) => {
                self.fail_github_job(candidate_id, job, error.code, error.message)
                    .await
            }
            Ok(InsightsStatus::Done(insights)) => {
                self.finish_github_job(candidate_id, job, &source, *insights)
                    .await
            }
            Ok(InsightsStatus::Pending { .. }) => {
                let tx = self
                    .repository
                    .transaction()
                    .await
                    .map_err(ApplicationError::storage)?;
                tx.lock_candidate(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?;
                let current = tx
                    .sources(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?
                    .into_iter()
                    .find(|item| item.id == source.id);
                if current.as_ref() != Some(&source) {
                    tx.commit().await.map_err(ApplicationError::storage)?;
                    return self
                        .fail_github_job(
                            candidate_id,
                            job,
                            "stale_input",
                            "Источник изменился во время синхронизации".into(),
                        )
                        .await;
                }
                let running = fsp_domain::SourceRecord {
                    active_job_id: Some(job.id.clone()),
                    ..source
                };
                tx.save_source(&running)
                    .await
                    .map_err(ApplicationError::storage)?;
                tx.save_job(&job).await.map_err(ApplicationError::storage)?;
                tx.commit().await.map_err(ApplicationError::storage)?;
                Ok(job_view(job, None))
            }
        }
    }

    /// Advances a running GitHub analysis job when it is polled: applies a finished report,
    /// records a failure, restarts an analysis the service no longer knows (after its restart)
    /// and gives up after [`GITHUB_JOB_TIMEOUT_MINUTES`].
    pub(super) async fn advance_github_job(
        &self,
        candidate_id: &str,
        job: fsp_domain::JobRecord,
    ) -> Result<JobView, ApplicationError> {
        let source = self
            .repository
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.active_job_id.as_deref() == Some(job.id.as_str()));
        let Some(source) = source else {
            return self
                .fail_github_job(
                    candidate_id,
                    job,
                    "stale_input",
                    "Источник изменился во время синхронизации".into(),
                )
                .await;
        };
        let (Some(login), Some(gateway)) =
            (source.account_label.clone(), self.github_insights.as_ref())
        else {
            return self
                .fail_github_job(
                    candidate_id,
                    job,
                    "github_unavailable",
                    "Анализ GitHub временно недоступен".into(),
                )
                .await;
        };
        let code = self.github_ownership_code(candidate_id);
        let status = match gateway.status(&login, Some(&code)).await {
            Ok(Some(status)) => Ok(status),
            Ok(None) => gateway.submit(&login, Some(&code), false).await,
            Err(error) => Err(error),
        };
        match status {
            Ok(InsightsStatus::Done(insights)) => {
                self.finish_github_job(candidate_id, job, &source, *insights)
                    .await
            }
            Ok(InsightsStatus::Failed(error)) => {
                self.fail_github_job(candidate_id, job, error.code, error.message)
                    .await
            }
            Err(error) if error.code != "github_unavailable" => {
                self.fail_github_job(candidate_id, job, error.code, error.message)
                    .await
            }
            // Still running, or the service is briefly unreachable: wait within the time limit.
            _ if !github_job_expired(&job.created_at) => Ok(job_view(job, None)),
            _ => {
                self.fail_github_job(
                    candidate_id,
                    job,
                    "github_unavailable",
                    "Анализ GitHub не завершился, повторите позже".into(),
                )
                .await
            }
        }
    }

    /// Applies a finished analysis: the refreshed source and the succeeded job commit together.
    async fn finish_github_job(
        &self,
        candidate_id: &str,
        mut job: fsp_domain::JobRecord,
        expected: &fsp_domain::SourceRecord,
        insights: GitHubInsights,
    ) -> Result<JobView, ApplicationError> {
        let record = match self
            .github_record(candidate_id, Some(expected), insights)
            .await
        {
            Ok(record) => record,
            Err(error) => {
                return self
                    .fail_github_job(candidate_id, job, error.code, error.message)
                    .await;
            }
        };
        let tx = self
            .repository
            .transaction()
            .await
            .map_err(ApplicationError::storage)?;
        tx.lock_candidate(candidate_id)
            .await
            .map_err(ApplicationError::storage)?;
        // A concurrent poll may have finished the job already.
        if let Some(stored) = tx
            .job(candidate_id, &job.id)
            .await
            .map_err(ApplicationError::storage)?
            .filter(|stored| stored.status != "running")
        {
            tx.commit().await.map_err(ApplicationError::storage)?;
            return Ok(job_view(stored, None));
        }
        let scoped = Self {
            repository: tx.share(),
            ..self.clone()
        };
        let mut candidate = scoped.candidate_index(candidate_id).await?;
        let current = tx
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.id == expected.id);
        let failure = if !candidate.profile.consents.processing {
            Some((
                "processing_consent_revoked",
                "Согласие на обработку отозвано",
            ))
        } else if current.as_ref() != Some(expected) {
            Some(("stale_input", "Источник изменился во время синхронизации"))
        } else {
            None
        };
        if let Some((code, message)) = failure {
            tx.commit().await.map_err(ApplicationError::storage)?;
            return self
                .fail_github_job(candidate_id, job, code, message.into())
                .await;
        }
        scoped.save_source_evidence(&mut candidate, &record).await?;
        let view = source_view(record, &self.github_ownership_code(candidate_id), None);
        job.status = "succeeded".into();
        job.updated_at = now();
        job.result_source_id = Some(view.id.clone());
        job.result_json = Some(
            serde_json::to_string(&JobResultView::SourceSync {
                source: view.clone(),
            })
            .map_err(|_| {
                ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
            })?,
        );
        tx.save_job(&job).await.map_err(ApplicationError::storage)?;
        tx.commit().await.map_err(ApplicationError::storage)?;
        Ok(job_view(job, Some(view)))
    }

    /// Fails a GitHub job and releases its source, unless a concurrent poll already finished it.
    async fn fail_github_job(
        &self,
        candidate_id: &str,
        mut job: fsp_domain::JobRecord,
        code: &'static str,
        message: String,
    ) -> Result<JobView, ApplicationError> {
        let tx = self
            .repository
            .transaction()
            .await
            .map_err(ApplicationError::storage)?;
        tx.lock_candidate(candidate_id)
            .await
            .map_err(ApplicationError::storage)?;
        if let Some(stored) = tx
            .job(candidate_id, &job.id)
            .await
            .map_err(ApplicationError::storage)?
            .filter(|stored| stored.status != "running")
        {
            tx.commit().await.map_err(ApplicationError::storage)?;
            return Ok(job_view(stored, None));
        }
        if let Some(mut source) = tx
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.active_job_id.as_deref() == Some(job.id.as_str()))
        {
            source.active_job_id = None;
            tx.save_source(&source)
                .await
                .map_err(ApplicationError::storage)?;
        }
        job.status = "failed".into();
        job.updated_at = now();
        job.error_code = Some(code.into());
        job.error_message = Some(message);
        tx.save_job(&job).await.map_err(ApplicationError::storage)?;
        tx.commit().await.map_err(ApplicationError::storage)?;
        Ok(job_view(job, None))
    }

    /// The analysis in flight for a GitHub source, as the analysis service reports it.
    pub(super) async fn github_progress(
        &self,
        record: &fsp_domain::SourceRecord,
    ) -> Option<GitHubAnalysisView> {
        if record.provider != fsp_domain::SourceProvider::Github {
            return None;
        }
        record.active_job_id.as_ref()?;
        let login = record.account_label.as_deref()?;
        let status = self
            .github_insights
            .as_ref()?
            .status(login, None)
            .await
            .ok()
            .flatten();
        Some(match status {
            Some(InsightsStatus::Pending {
                queued,
                stage,
                progress,
            }) => analysis_view(queued, stage, progress),
            Some(InsightsStatus::Done(_)) => GitHubAnalysisView {
                state: "running",
                stage: "Сохранение отчёта".into(),
                progress: 100,
            },
            Some(InsightsStatus::Failed(error)) => GitHubAnalysisView {
                state: "failed",
                stage: error.message,
                progress: 0,
            },
            // Unknown to the service (it restarted): the next job poll starts it again.
            None => analysis_view(true, "В очереди".into(), 0),
        })
    }

    async fn github_source(
        &self,
        candidate_id: &str,
    ) -> Result<Option<fsp_domain::SourceRecord>, ApplicationError> {
        Ok(self
            .repository
            .sources(candidate_id)
            .await
            .map_err(ApplicationError::storage)?
            .into_iter()
            .find(|source| source.provider == fsp_domain::SourceProvider::Github))
    }

    /// Builds the GitHub source from a finished analysis and decides ownership.
    ///
    /// Ownership is kept from an earlier proof for the same login, proven now by the ownership code
    /// in the bio, or proven by an OAuth token of the same account. A login proven by another
    /// candidate cannot be proven again.
    async fn github_record(
        &self,
        candidate_id: &str,
        previous: Option<&fsp_domain::SourceRecord>,
        insights: GitHubInsights,
    ) -> Result<fsp_domain::SourceRecord, ApplicationError> {
        let report = insights.report;
        let canonical = report.login.clone();
        let same_login = |ownership: &&fsp_domain::GitHubOwnership| {
            ownership.login.eq_ignore_ascii_case(&canonical)
        };
        let mut ownership = previous
            .and_then(|source| source.analysis.as_ref())
            .and_then(|analysis| analysis.ownership.as_ref())
            .filter(same_login)
            .cloned();
        if ownership.is_none() && insights.ownership_code_found == Some(true) {
            ownership = Some(fsp_domain::GitHubOwnership {
                login: canonical.clone(),
                method: fsp_domain::OwnershipMethod::ProfileCode,
                verified_at: now(),
            });
        }
        if ownership.is_none()
            && let Some(github) = &self.github
            && let Some(token) = self
                .repository
                .github_token(candidate_id)
                .await
                .map_err(ApplicationError::storage)?
            && github
                .authenticated_login(&token)
                .await
                .is_ok_and(|authenticated| authenticated.eq_ignore_ascii_case(&canonical))
        {
            ownership = Some(fsp_domain::GitHubOwnership {
                login: canonical.clone(),
                method: fsp_domain::OwnershipMethod::Oauth,
                verified_at: now(),
            });
        }
        if ownership.is_some() {
            let claimed = self
                .repository
                .github_sources(&canonical)
                .await
                .map_err(ApplicationError::storage)?
                .into_iter()
                .any(|source| {
                    source.candidate_id != candidate_id
                        && source
                            .analysis
                            .as_ref()
                            .and_then(|analysis| analysis.ownership.as_ref())
                            .is_some_and(|other| other.login.eq_ignore_ascii_case(&canonical))
                });
            if claimed {
                return Err(ApplicationError::new(
                    409,
                    "github_account_taken",
                    "Владение этим аккаунтом GitHub уже подтвердил другой кандидат",
                ));
            }
        }
        // Skill evidence comes only from repositories the candidate substantially develops.
        let repositories = report
            .repositories
            .iter()
            .filter(|repository| {
                !repository.fork
                    && (repository.owned || repository.led || repository.user_commits >= 10)
            })
            .map(|repository| fsp_domain::AnalyzedRepository {
                id: format!("github-{}", repository.name_with_owner),
                name: repository.name_with_owner.clone(),
                url: repository.url.clone(),
                technologies: repository.technologies.clone(),
                metrics: fsp_domain::RepositoryMetrics {
                    stars: u64::from(repository.stars),
                    forks: u64::from(repository.forks),
                    open_issues: 0,
                    size_kib: 0,
                    pushed_at: repository.pushed_at.clone(),
                },
            })
            .collect();
        Ok(fsp_domain::SourceRecord {
            id: format!("source-github-{candidate_id}"),
            candidate_id: candidate_id.into(),
            provider: fsp_domain::SourceProvider::Github,
            synthetic: false,
            active_job_id: None,
            account_label: Some(canonical.clone()),
            last_synced_at: Some(now()),
            analysis: Some(fsp_domain::GitHubAnalysis {
                username: canonical,
                repositories,
                active_days: report.activity.active_days_last_year,
                observed_from: Some(report.coverage.from.clone()),
                observed_to: Some(report.coverage.to.clone()),
                report: Some(report),
                ownership,
            }),
            verified_participation: false,
            competition_ids: Vec::new(),
            fsp_results: Vec::new(),
        })
    }

    // Called only after locking the candidate inside the source write transaction.
    async fn save_source_evidence(
        &self,
        candidate: &mut CandidateIndexRecord,
        source: &fsp_domain::SourceRecord,
    ) -> Result<(), ApplicationError> {
        apply_source_evidence(candidate, source);
        candidate.profile.revision += 1;
        candidate.profile.updated_at = now();
        self.repository
            .save_source(source)
            .await
            .map_err(ApplicationError::storage)?;
        self.repository
            .save_candidate(&candidate.profile)
            .await
            .map_err(ApplicationError::storage)?;
        self.repository
            .save_candidate_index(candidate)
            .await
            .map_err(ApplicationError::storage)
    }
}

fn apply_source_evidence(candidate: &mut CandidateIndexRecord, source: &fsp_domain::SourceRecord) {
    use fsp_domain::{EvidenceSource, SkillEvidence, SourceProvider};
    let provider = match source.provider {
        SourceProvider::Github => EvidenceSource::Github,
        SourceProvider::Fsp => EvidenceSource::Fsp,
    };
    if !candidate.source_kinds.contains(&provider) {
        candidate.source_kinds.push(provider);
    }
    if source.provider == SourceProvider::Fsp {
        candidate.fsp_verified = source.verified_participation;
        // Participation alone does not prove an individual technology or grade.
        return;
    }
    for skill in &mut candidate.skills {
        skill.sources.retain(|item| *item != provider);
        if skill.sources.is_empty() && skill.status == EvidenceStatus::Evidence {
            skill.status = if candidate.profile.stack.contains(&skill.skill_id) {
                EvidenceStatus::Observed
            } else {
                EvidenceStatus::Insufficient
            };
            skill.evidence_grade = None;
        }
    }
    let technologies: std::collections::BTreeSet<_> = source
        .analysis
        .iter()
        .flat_map(|analysis| &analysis.repositories)
        .flat_map(|repository| &repository.technologies)
        .filter(|technology| fsp_domain::catalog::is_skill(technology))
        .cloned()
        .collect();
    for skill_id in technologies {
        if let Some(skill) = candidate
            .skills
            .iter_mut()
            .find(|skill| skill.skill_id == skill_id)
        {
            skill.sources.push(provider);
            if [EvidenceStatus::Insufficient, EvidenceStatus::Observed].contains(&skill.status) {
                skill.status = EvidenceStatus::Evidence;
                skill.evidence_grade = None;
            }
        } else {
            candidate.skills.push(SkillEvidence {
                skill_id,
                status: EvidenceStatus::Evidence,
                evidence_grade: None,
                sources: vec![provider],
            });
        }
    }
    candidate.skills.sort_by(|a, b| a.skill_id.cmp(&b.skill_id));
}

fn running_job(candidate_id: &str, kind: &str) -> fsp_domain::JobRecord {
    let created_at = now();
    fsp_domain::JobRecord {
        id: format!("job-{}", Uuid::new_v4().simple()),
        owner_id: candidate_id.into(),
        kind: kind.into(),
        status: "running".into(),
        candidate_id: Some(candidate_id.into()),
        assessment_id: None,
        input_revision: None,
        result_json: None,
        confirmed: false,
        created_at: created_at.clone(),
        updated_at: created_at,
        result_source_id: None,
        error_code: None,
        error_message: None,
    }
}

fn analysis_view(queued: bool, stage: String, progress: u8) -> GitHubAnalysisView {
    GitHubAnalysisView {
        state: if queued { "queued" } else { "running" },
        stage,
        progress: progress.min(100),
    }
}

fn github_job_expired(created_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(created_at).is_ok_and(|created| {
        Utc::now().signed_duration_since(created) > Duration::minutes(GITHUB_JOB_TIMEOUT_MINUTES)
    })
}
