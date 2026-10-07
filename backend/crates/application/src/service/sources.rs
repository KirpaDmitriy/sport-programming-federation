//! Inline source ingestion and its transactionally derived candidate evidence.
use super::*;

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
        let record = match provider {
            "github" => {
                let token = self
                    .repository
                    .github_token(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?
                    .ok_or_else(|| {
                        ApplicationError::new(
                            409,
                            "github_authorization_required",
                            "Сначала авторизуйте доступ к GitHub",
                        )
                    })?;
                let analysis = self
                    .github()?
                    .analyze(account, &token)
                    .await
                    .map_err(integration_error)?;
                fsp_domain::SourceRecord {
                    id: format!("source-github-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    provider: fsp_domain::SourceProvider::Github,
                    synthetic: false,
                    active_job_id: None,
                    account_label: Some(analysis.username.clone()),
                    last_synced_at: Some(now()),
                    analysis: Some(analysis),
                    verified_participation: false,
                    competition_ids: Vec::new(),
                }
            }
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
        Ok(source_view(record))
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
        // Rust completes these bounded integration calls inline. No persistent
        // running marker is published, so a process crash cannot strand a job.
        let expected_source = source.clone();
        let created_at = now();
        let mut job = fsp_domain::JobRecord {
            id: format!("job-{}", Uuid::new_v4().simple()),
            owner_id: candidate_id.into(),
            kind: "source_sync".into(),
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
        };
        let result = match source.provider {
            fsp_domain::SourceProvider::Github => {
                let token = self
                    .repository
                    .github_token(candidate_id)
                    .await
                    .map_err(ApplicationError::storage)?
                    .ok_or_else(|| {
                        ApplicationError::new(
                            409,
                            "github_authorization_required",
                            "Авторизуйте GitHub повторно",
                        )
                    })?;
                let username = source.account_label.as_deref().ok_or_else(|| {
                    ApplicationError::new(
                        409,
                        "source_not_connected",
                        "Сначала подключите источник",
                    )
                })?;
                self.github()?
                    .analyze(username, &token)
                    .await
                    .map(|analysis| fsp_domain::SourceRecord {
                        analysis: Some(analysis),
                        last_synced_at: Some(now()),
                        active_job_id: None,
                        ..source
                    })
            }
            fsp_domain::SourceProvider::Fsp => Ok(fsp_domain::SourceRecord {
                last_synced_at: Some(now()),
                active_job_id: None,
                ..source
            }),
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
                        source: source_view(updated.clone()),
                    })
                    .map_err(|_| {
                        ApplicationError::new(500, "internal_error", "Сервис временно недоступен")
                    })?,
                );
                tx.save_job(&job).await.map_err(ApplicationError::storage)?;
                tx.commit().await.map_err(ApplicationError::storage)?;
                Ok(job_view(job, Some(source_view(updated))))
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
        .filter(|technology| CATALOG_SKILLS.contains(&technology.as_str()))
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
