//! Versioned knowledge tests. The private answer key never enters the public task DTO.
use std::{collections::HashSet, sync::LazyLock};

use serde::{Deserialize, Serialize};

use crate::{
    AssessmentAnswer, AssessmentCheck, AssessmentTask, Grade, RubricCriterion, RubricOutcome,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KnowledgeOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQuestion {
    pub id: String,
    pub skill_id: String,
    pub prompt: String,
    pub options: Vec<KnowledgeOption>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KnowledgeResponse {
    pub question_id: String,
    pub option_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BankQuestion {
    #[serde(flatten)]
    question: KnowledgeQuestion,
    grade: Grade,
    correct_option_id: String,
    explanation: String,
    source: String,
}

#[derive(Deserialize)]
struct Bank {
    version: String,
    questions: Vec<BankQuestion>,
}

static BANK: LazyLock<Bank> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../data/knowledge-v1.json"))
        .expect("versioned knowledge bank must be valid")
});

#[must_use]
pub fn knowledge_task(grade: Grade) -> AssessmentTask {
    AssessmentTask {
        id: format!("knowledge-{}-v1", grade.as_str()),
        family: "backend-knowledge".into(),
        version: BANK.version.clone(),
        variant_id: format!("backend-{}-v1", grade.as_str()),
        title: "Тест знаний: Rust и PostgreSQL".into(),
        prompt: "Выберите один ответ в каждом из 10 вопросов. Для зачёта нужны минимум 8 верных ответов из 10 и минимум 3 из 5 по каждой теме. ИИ и справочники разрешены. Результат показывает знания по этому тесту, а не опыт написания кода.".into(),
        language: "rust".into(),
        starter_code: String::new(),
        acceptance_criteria: vec!["Не менее 8 верных ответов из 10".into(), "Не менее 3 из 5 по Rust и 3 из 5 по PostgreSQL".into()],
        rubric: [("rust", "Rust"), ("postgresql", "PostgreSQL")].into_iter().map(|(id, label)| RubricCriterion {
            id: id.into(), label: label.into(), weight: 5,
        }).collect(),
        ai_allowed: true,
        external_ai_allowed: true,
        execution: "questionnaire".into(),
        questions: BANK.questions.iter().filter(|q| q.grade == grade).map(|q| q.question.clone()).collect(),
    }
}

/// Reject foreign, duplicated and malformed selections even when saving a partial draft.
#[must_use]
pub fn valid_knowledge_answer(task: &AssessmentTask, answer: &AssessmentAnswer) -> bool {
    if !answer.code.is_empty()
        || !answer.explanation.is_empty()
        || answer.responses.len() > task.questions.len()
    {
        return false;
    }
    let mut seen = HashSet::new();
    answer.responses.iter().all(|r| {
        seen.insert(&r.question_id)
            && task
                .questions
                .iter()
                .any(|q| q.id == r.question_id && q.options.iter().any(|o| o.id == r.option_id))
    })
}

#[must_use]
pub fn knowledge_completion(
    task: &AssessmentTask,
    answer: &AssessmentAnswer,
) -> Vec<AssessmentCheck> {
    task.questions
        .iter()
        .map(|q| {
            let chosen = answer.responses.iter().any(|r| r.question_id == q.id);
            AssessmentCheck {
                id: q.id.clone(),
                label: q.prompt.clone(),
                status: if chosen { "passed" } else { "not_run" }.into(),
                message: if chosen {
                    "Ответ выбран; правильность проверяется после отправки"
                } else {
                    "Выберите ответ"
                }
                .into(),
            }
        })
        .collect()
}

pub struct KnowledgeScore {
    pub passed: bool,
    pub checks: Vec<AssessmentCheck>,
    pub rubric: Vec<RubricOutcome>,
    pub feedback: String,
}

/// Only the exact immutable version can be scored. Unknown versions fail closed.
#[must_use]
pub fn score_knowledge(
    grade: Grade,
    task: &AssessmentTask,
    answer: &AssessmentAnswer,
) -> Option<KnowledgeScore> {
    let canonical = knowledge_task(grade);
    if task != &canonical
        || !valid_knowledge_answer(task, answer)
        || answer.responses.len() != task.questions.len()
    {
        return None;
    }
    let mut rust = 0;
    let mut postgres = 0;
    let checks = BANK
        .questions
        .iter()
        .filter(|q| q.grade == grade)
        .map(|q| {
            let correct = answer
                .responses
                .iter()
                .any(|r| r.question_id == q.question.id && r.option_id == q.correct_option_id);
            if correct {
                if q.question.skill_id == "rust" {
                    rust += 1;
                } else {
                    postgres += 1;
                }
            }
            let label = q
                .question
                .options
                .iter()
                .find(|o| o.id == q.correct_option_id)
                .map_or("", |o| o.label.as_str());
            AssessmentCheck {
                id: q.question.id.clone(),
                label: q.question.prompt.clone(),
                status: if correct { "passed" } else { "failed" }.into(),
                message: format!(
                    "Верный ответ: {label}. {} Источник: {}",
                    q.explanation, q.source
                ),
            }
        })
        .collect();
    let total = rust + postgres;
    Some(KnowledgeScore {
        passed: total >= 8 && rust >= 3 && postgres >= 3,
        checks,
        rubric: [
            ("rust", "Rust", rust),
            ("postgresql", "PostgreSQL", postgres),
        ]
        .into_iter()
        .map(|(id, label, count)| RubricOutcome {
            criterion_id: id.into(),
            label: label.into(),
            outcome: if count >= 3 { "met" } else { "not_met" }.into(),
            feedback: format!("{count} из 5 верных ответов; порог по теме — 3."),
        })
        .collect(),
        feedback: format!(
            "Верных ответов: {total} из 10. Rust: {rust}/5; PostgreSQL: {postgres}/5. Для зачёта нужны 8/10 и не менее 3/5 по каждой теме. Проверены знания по тесту версии {}; практический опыт разработки не оценивался. ИИ и справочники разрешены.",
            BANK.version
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bank_integrity_and_private_answer_key() {
        for grade in [Grade::Junior, Grade::Middle, Grade::Senior] {
            let task = knowledge_task(grade);
            assert_eq!(task.questions.len(), 10);
            let wire = serde_json::to_string(&task).unwrap();
            assert!(
                !wire.contains("correctOptionId")
                    && !wire.contains("explanation")
                    && !wire.contains("https://")
            );
            let mut ids = HashSet::new();
            for question in BANK.questions.iter().filter(|q| q.grade == grade) {
                assert!(ids.insert(&question.question.id));
                assert_eq!(question.question.options.len(), 3);
                assert_eq!(
                    question
                        .question
                        .options
                        .iter()
                        .filter(|o| o.id == question.correct_option_id)
                        .count(),
                    1
                );
                assert!(
                    !question.explanation.is_empty() && question.source.starts_with("https://")
                );
            }
            let mut answer = AssessmentAnswer {
                code: String::new(),
                explanation: String::new(),
                external_ai_used: false,
                responses: vec![],
            };
            assert!(score_knowledge(grade, &task, &answer).is_none());
            answer.responses = BANK
                .questions
                .iter()
                .filter(|q| q.grade == grade)
                .map(|q| KnowledgeResponse {
                    question_id: q.question.id.clone(),
                    option_id: q.correct_option_id.clone(),
                })
                .collect();
            assert!(score_knowledge(grade, &task, &answer).unwrap().passed);
            for (index, item) in answer.responses.iter_mut().enumerate() {
                item.option_id = task.questions[index]
                    .options
                    .iter()
                    .find(|o| o.id != item.option_id)
                    .unwrap()
                    .id
                    .clone();
            }
            assert!(!score_knowledge(grade, &task, &answer).unwrap().passed);
            answer.responses[1] = answer.responses[0].clone();
            assert!(!valid_knowledge_answer(&task, &answer));
        }
    }
}
