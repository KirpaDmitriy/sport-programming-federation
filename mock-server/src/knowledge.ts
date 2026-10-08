import bank from '../../backend/crates/domain/data/knowledge-v1.json';
import type { components } from './generated/schema.d.ts';

type Schemas = components['schemas'];
type Task = Schemas['AssessmentTask'];
type Answer = Schemas['AssessmentAnswer'];
type Grade = Schemas['Assessment']['grade'];

// This module is server-only; the frontend receives public questions through the API.
export function knowledgeTask(grade: Grade): Task {
  return {
    id: `knowledge-${grade}-v1`,
    family: 'backend-knowledge',
    version: bank.version,
    variantId: `backend-${grade}-v1`,
    title: 'Тест знаний: Rust и PostgreSQL',
    prompt:
      'Выберите один ответ в каждом из 10 вопросов. Для зачёта нужны минимум 8 верных ответов из 10 и минимум 3 из 5 по каждой теме. ИИ и справочники разрешены. Результат показывает знания по этому тесту, а не опыт написания кода.',
    language: 'rust',
    starterCode: '',
    execution: 'questionnaire',
    aiAllowed: true,
    externalAiAllowed: true,
    acceptanceCriteria: ['Не менее 8 верных ответов из 10', 'Не менее 3 из 5 по Rust и 3 из 5 по PostgreSQL'],
    rubric: [
      { id: 'rust', label: 'Rust', weight: 5 },
      { id: 'postgresql', label: 'PostgreSQL', weight: 5 },
    ],
    questions: bank.questions
      .filter((q) => q.grade === grade)
      .map((q) => {
        if (q.skillId !== 'rust' && q.skillId !== 'postgresql') throw new Error('Invalid knowledge skill');
        return { id: q.id, skillId: q.skillId, prompt: q.prompt, options: structuredClone(q.options) };
      }),
  };
}

export function validKnowledgeAnswer(task: Task, answer: Answer): boolean {
  const responses = answer.responses ?? [];
  return (
    !answer.code &&
    !answer.explanation &&
    responses.length <= 10 &&
    new Set(responses.map((r) => r.questionId)).size === responses.length &&
    responses.every((r) =>
      task.questions?.some((q) => q.id === r.questionId && q.options.some((o) => o.id === r.optionId)),
    )
  );
}

export function knowledgeCompletion(task: Task, answer: Answer): Schemas['Check'][] {
  return (task.questions ?? []).map((q) => {
    const chosen = answer.responses?.some((r) => r.questionId === q.id);
    return {
      id: q.id,
      label: q.prompt,
      status: chosen ? 'passed' : 'not_run',
      message: chosen ? 'Ответ выбран; правильность проверяется после отправки' : 'Выберите ответ',
    };
  });
}

export function scoreKnowledge(grade: Grade, task: Task, answer: Answer) {
  if (task.version !== bank.version || !validKnowledgeAnswer(task, answer) || answer.responses?.length !== 10)
    return null;
  const counts = { rust: 0, postgresql: 0 };
  const checks: Schemas['Check'][] = bank.questions
    .filter((q) => q.grade === grade)
    .map((q) => {
      const correct = answer.responses?.some((r) => r.questionId === q.id && r.optionId === q.correctOptionId);
      if (q.skillId !== 'rust' && q.skillId !== 'postgresql') throw new Error('Invalid knowledge skill');
      if (correct) counts[q.skillId] += 1;
      const label = q.options.find((o) => o.id === q.correctOptionId)?.label;
      return {
        id: q.id,
        label: q.prompt,
        status: correct ? 'passed' : 'failed',
        message: `Верный ответ: ${label}. ${q.explanation} Источник: ${q.source}`,
      };
    });
  const total = counts.rust + counts.postgresql;
  const rubric: Schemas['RubricOutcome'][] = task.rubric.map((r) => {
    const count = r.id === 'rust' ? counts.rust : counts.postgresql;
    return {
      criterionId: r.id,
      label: r.label,
      outcome: count >= 3 ? 'met' : 'not_met',
      feedback: `${count} из 5 верных ответов; порог по теме — 3.`,
    };
  });
  return {
    passed: total >= 8 && counts.rust >= 3 && counts.postgresql >= 3,
    checks,
    rubric,
    feedback: `Верных ответов: ${total} из 10. Rust: ${counts.rust}/5; PostgreSQL: ${counts.postgresql}/5. Для зачёта нужны 8/10 и не менее 3/5 по каждой теме. Проверены знания по тесту версии ${bank.version}; практический опыт разработки не оценивался. ИИ и справочники разрешены.`,
  };
}
