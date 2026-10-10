use std::collections::BTreeMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::domain::{
    AvatarCue, EvidenceState, InterviewEvidence, InterviewListView, InterviewQuestion,
    InterviewSession, InterviewStatus, InterviewView, QuestionDelivery, blueprint,
};
use crate::model::{AnswerContext, InterviewModel, ModelError, QuestionContext};
use crate::storage::{InterviewRepository, MemoryInterviewRepository, RepositoryError};

const RUBRIC_VERSION: &str = "graph-interview-rubric-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServiceError {
    InvalidInput,
    NotFound,
    Conflict,
    ModelUnavailable,
    Unavailable,
}

impl From<ModelError> for ServiceError {
    fn from(_: ModelError) -> Self {
        Self::ModelUnavailable
    }
}

impl From<RepositoryError> for ServiceError {
    fn from(value: RepositoryError) -> Self {
        match value {
            RepositoryError::Conflict => Self::Conflict,
            RepositoryError::Unavailable => Self::Unavailable,
        }
    }
}

pub struct InterviewService {
    model: Arc<dyn InterviewModel>,
    repository: Arc<dyn InterviewRepository>,
}

impl InterviewService {
    pub fn new(model: Arc<dyn InterviewModel>) -> Self {
        Self::with_repository(model, Arc::new(MemoryInterviewRepository::default()))
    }

    pub fn with_repository(
        model: Arc<dyn InterviewModel>,
        repository: Arc<dyn InterviewRepository>,
    ) -> Self {
        Self { model, repository }
    }

    pub async fn healthy(&self) -> Result<(), ServiceError> {
        self.repository.healthy().await.map_err(Into::into)
    }

    pub async fn start(
        &self,
        candidate_id: &str,
        blueprint_id: &str,
        max_turns: u8,
    ) -> Result<InterviewView, ServiceError> {
        if !valid_identifier(candidate_id) || !(4..=20).contains(&max_turns) {
            return Err(ServiceError::InvalidInput);
        }
        let graph = blueprint(blueprint_id).ok_or(ServiceError::InvalidInput)?;
        graph.validate().map_err(|_| ServiceError::InvalidInput)?;
        if let Some(active) = self
            .repository
            .list(candidate_id)
            .await?
            .into_iter()
            .find(|session| session.status == InterviewStatus::Active)
        {
            let active_blueprint =
                blueprint(&active.blueprint_id).ok_or(ServiceError::InvalidInput)?;
            return Ok(active.public_view(active_blueprint));
        }
        let id = Uuid::new_v4().to_string();
        let node_states = graph
            .nodes
            .iter()
            .map(|node| (node.id.to_owned(), EvidenceState::Unknown))
            .collect();
        let mut session = InterviewSession {
            id,
            candidate_id: candidate_id.to_owned(),
            blueprint_id: blueprint_id.to_owned(),
            status: InterviewStatus::Active,
            revision: 0,
            max_turns,
            current_question: None,
            node_states,
            attempts: BTreeMap::new(),
            evidence: Vec::new(),
            model_mode: self.model.mode().into(),
        };
        session.current_question = Some(self.question_for(&session, graph.start_node_id).await?);
        let view = session.public_view(graph);
        match self.repository.insert(&session).await {
            Ok(()) => {}
            Err(RepositoryError::Conflict) => {
                if let Some(active) = self
                    .repository
                    .list(candidate_id)
                    .await?
                    .into_iter()
                    .find(|current| current.status == InterviewStatus::Active)
                {
                    let active_blueprint =
                        blueprint(&active.blueprint_id).ok_or(ServiceError::InvalidInput)?;
                    return Ok(active.public_view(active_blueprint));
                }
                return Err(ServiceError::Conflict);
            }
            Err(error) => return Err(error.into()),
        }
        Ok(view)
    }

    pub async fn get(&self, id: &str) -> Result<InterviewView, ServiceError> {
        let session = self
            .repository
            .get(id)
            .await?
            .ok_or(ServiceError::NotFound)?;
        let blueprint = blueprint(&session.blueprint_id).ok_or(ServiceError::InvalidInput)?;
        Ok(session.public_view(blueprint))
    }

    pub async fn list(&self, candidate_id: &str) -> Result<InterviewListView, ServiceError> {
        if !valid_identifier(candidate_id) {
            return Err(ServiceError::InvalidInput);
        }
        let items = self
            .repository
            .list(candidate_id)
            .await?
            .into_iter()
            .map(|session| {
                let blueprint =
                    blueprint(&session.blueprint_id).ok_or(ServiceError::InvalidInput)?;
                Ok(session.public_view(blueprint))
            })
            .collect::<Result<Vec<_>, ServiceError>>()?;
        Ok(InterviewListView { items })
    }

    pub async fn answer(
        &self,
        id: &str,
        question_id: &str,
        answer: &str,
        revision: u32,
    ) -> Result<InterviewView, ServiceError> {
        if answer.trim().is_empty() || answer.chars().count() > 8_000 {
            return Err(ServiceError::InvalidInput);
        }
        let snapshot = self
            .repository
            .get(id)
            .await?
            .ok_or(ServiceError::NotFound)?;
        if snapshot.status != InterviewStatus::Active || snapshot.revision != revision {
            return Err(ServiceError::Conflict);
        }
        let question = snapshot
            .current_question
            .as_ref()
            .filter(|question| question.id == question_id)
            .ok_or(ServiceError::Conflict)?;
        let blueprint = blueprint(&snapshot.blueprint_id).ok_or(ServiceError::InvalidInput)?;
        let node = blueprint
            .node(&question.node_id)
            .ok_or(ServiceError::InvalidInput)?;
        let evaluation = self
            .model
            .evaluate_answer(AnswerContext {
                node,
                question: &question.prompt,
                answer,
            })
            .await?;

        let mut updated = snapshot.clone();
        updated.revision += 1;
        updated
            .node_states
            .insert(node.id.to_owned(), evaluation.state);
        *updated.attempts.entry(node.id.to_owned()).or_default() += 1;
        updated.evidence.push(InterviewEvidence {
            node_id: node.id.to_owned(),
            state: evaluation.state,
            question_id: question.id.clone(),
            answer_excerpt: evaluation.evidence_quote,
            rationale: evaluation.rationale,
            evaluator: evaluation.evaluator,
            rubric_version: RUBRIC_VERSION.into(),
        });
        let next = select_next_node(blueprint, &updated, node.id);
        if updated.evidence.len() >= usize::from(updated.max_turns) || next.is_none() {
            updated.status = InterviewStatus::Completed;
            updated.current_question = None;
        } else if let Some(next) = next {
            updated.current_question = Some(self.question_for(&updated, next).await?);
        }

        let view = updated.public_view(blueprint);
        self.repository.replace(&updated, revision).await?;
        Ok(view)
    }

    async fn question_for(
        &self,
        session: &InterviewSession,
        node_id: &str,
    ) -> Result<InterviewQuestion, ServiceError> {
        let blueprint = blueprint(&session.blueprint_id).ok_or(ServiceError::InvalidInput)?;
        let node = blueprint.node(node_id).ok_or(ServiceError::InvalidInput)?;
        let sequence =
            u8::try_from(session.evidence.len() + 1).map_err(|_| ServiceError::Conflict)?;
        let prompt = self
            .model
            .generate_question(QuestionContext {
                session_id: &session.id,
                sequence,
                node,
            })
            .await?;
        Ok(InterviewQuestion {
            id: format!("q-{sequence}-{}", Uuid::new_v4()),
            node_id: node.id.to_owned(),
            delivery: QuestionDelivery {
                speech_text: prompt.clone(),
                avatar_cue: AvatarCue::Speaking,
            },
            prompt,
            sequence,
        })
    }
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn select_next_node<'a>(
    blueprint: &'a crate::domain::InterviewBlueprint,
    session: &InterviewSession,
    current_node_id: &str,
) -> Option<&'a str> {
    let current = blueprint.node(current_node_id)?;
    let current_state = session
        .node_states
        .get(current_node_id)
        .copied()
        .unwrap_or(EvidenceState::Unknown);
    if current_state != EvidenceState::Confirmed
        && let Some(prerequisite) = current
            .prerequisites
            .iter()
            .copied()
            .find(|id| session.node_states.get(*id) == Some(&EvidenceState::Unknown))
    {
        return Some(prerequisite);
    }
    if matches!(
        current_state,
        EvidenceState::Observed | EvidenceState::Partial
    ) && session.attempts.get(current_node_id).copied().unwrap_or(0) < 2
    {
        return Some(current.id);
    }
    if let Some(parent) = blueprint
        .nodes
        .iter()
        .filter(|node| {
            matches!(
                session.node_states.get(node.id),
                Some(EvidenceState::Observed | EvidenceState::Partial)
            ) && session.attempts.get(node.id).copied().unwrap_or(0) < 2
                && node
                    .prerequisites
                    .iter()
                    .all(|id| session.node_states.get(*id) != Some(&EvidenceState::Unknown))
        })
        .max_by_key(|node| node.criticality)
    {
        return Some(parent.id);
    }
    blueprint
        .nodes
        .iter()
        .filter(|node| session.node_states.get(node.id) == Some(&EvidenceState::Unknown))
        .max_by_key(|node| {
            let reach = blueprint
                .nodes
                .iter()
                .filter(|candidate| candidate.prerequisites.contains(&node.id))
                .count();
            (
                usize::from(node.criticality) * 10 + reach,
                std::cmp::Reverse(node.id),
            )
        })
        .map(|node| node.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::BACKEND_MIDDLE;
    use crate::model::OfflineModel;

    #[tokio::test]
    async fn weak_composite_answer_descends_to_unknown_prerequisite() {
        let service = InterviewService::new(Arc::new(OfflineModel));
        let started = service
            .start("candidate-1", BACKEND_MIDDLE.id, 10)
            .await
            .unwrap();
        assert_eq!(
            started.current_question.as_ref().unwrap().node_id,
            "backend.idempotency"
        );
        let next = service
            .answer(
                &started.id,
                &started.current_question.unwrap().id,
                "Я бы сначала посмотрел логи.",
                started.revision,
            )
            .await
            .unwrap();
        assert_eq!(
            next.current_question.as_ref().unwrap().node_id,
            "backend.unique-operation"
        );
    }

    #[tokio::test]
    async fn confirmed_node_is_not_repeated_and_stale_answer_is_rejected() {
        let service = InterviewService::new(Arc::new(OfflineModel));
        let started = service
            .start("candidate-2", BACKEND_MIDDLE.id, 10)
            .await
            .unwrap();
        let question = started.current_question.clone().unwrap();
        let next = service
            .answer(
                &started.id,
                &question.id,
                "Ключ идемпотентности защищает уникальный индекс; в транзакции сохраняю ответ для повтора.",
                0,
            )
            .await
            .unwrap();
        assert_ne!(
            next.current_question.unwrap().node_id,
            "backend.idempotency"
        );
        assert!(matches!(
            service.answer(&started.id, &question.id, "повтор", 0).await,
            Err(ServiceError::Conflict)
        ));
    }

    #[tokio::test]
    async fn empty_and_oversized_answers_are_rejected() {
        let service = InterviewService::new(Arc::new(OfflineModel));
        let started = service
            .start("candidate-3", BACKEND_MIDDLE.id, 10)
            .await
            .unwrap();
        let question = started.current_question.unwrap();
        assert!(matches!(
            service.answer(&started.id, &question.id, "  ", 0).await,
            Err(ServiceError::InvalidInput)
        ));
        assert!(matches!(
            service
                .answer(&started.id, &question.id, &"a".repeat(8_001), 0)
                .await,
            Err(ServiceError::InvalidInput)
        ));
    }

    #[test]
    fn closed_prerequisites_return_the_frontier_to_the_composite_node() {
        let mut node_states = BACKEND_MIDDLE
            .nodes
            .iter()
            .map(|node| (node.id.to_owned(), EvidenceState::Unknown))
            .collect::<BTreeMap<_, _>>();
        node_states.insert("backend.idempotency".into(), EvidenceState::Observed);
        for id in [
            "backend.unique-operation",
            "backend.transactions",
            "backend.concurrency",
        ] {
            node_states.insert(id.into(), EvidenceState::Confirmed);
        }
        let session = InterviewSession {
            id: "session".into(),
            candidate_id: "candidate".into(),
            blueprint_id: BACKEND_MIDDLE.id.into(),
            status: InterviewStatus::Active,
            revision: 4,
            max_turns: 10,
            current_question: None,
            node_states,
            attempts: BTreeMap::from([
                ("backend.idempotency".into(), 1),
                ("backend.concurrency".into(), 1),
            ]),
            evidence: Vec::new(),
            model_mode: "offline_rubric".into(),
        };
        assert_eq!(
            select_next_node(&BACKEND_MIDDLE, &session, "backend.concurrency"),
            Some("backend.idempotency")
        );
    }
}
