import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Assessment = components['schemas']['Assessment'];
export type AssessmentAnswer = components['schemas']['AssessmentAnswer'];
export type AssessmentStatus = Assessment['status'];
export type Check = components['schemas']['Check'];
export type RubricOutcome = components['schemas']['RubricOutcome'];
type StartInput = components['schemas']['AssessmentStartInput'];

export const assessmentsKey = (scope: Scope) => [...scope, 'assessments'] as const;
export const assessmentKey = (scope: Scope, id: string) => [...scope, 'assessments', id] as const;

export const editableStatuses: AssessmentStatus[] = ['draft', 'in_progress'];
export const pendingStatuses: AssessmentStatus[] = ['submitted', 'evaluating'];
export const isEditable = (assessment: Assessment) => editableStatuses.includes(assessment.status);
export const isEvaluating = (assessment: Assessment) => pendingStatuses.includes(assessment.status);

export const assessmentsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: assessmentsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/assessments', { signal })),
  });

export const assessmentQuery = (scope: Scope, assessmentId: string) =>
  queryOptions({
    queryKey: assessmentKey(scope, assessmentId),
    queryFn: async ({ signal }) =>
      requireData(
        await api.GET('/api/v1/me/assessments/{assessmentId}', { params: { path: { assessmentId } }, signal }),
      ),
  });

export async function startAssessment(input: StartInput, idempotencyKey: string) {
  return requireData(
    await api.POST('/api/v1/me/assessments', {
      body: input,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    }),
  );
}

export async function saveAnswer(assessmentId: string, answer: AssessmentAnswer) {
  return requireData(
    await api.PUT('/api/v1/me/assessments/{assessmentId}/answer', { params: { path: { assessmentId } }, body: answer }),
  );
}

export async function runChecks(assessmentId: string) {
  return requireData(
    await api.POST('/api/v1/me/assessments/{assessmentId}/checks', { params: { path: { assessmentId } } }),
  );
}

export async function askAssistant(assessmentId: string, message: string) {
  return requireData(
    await api.POST('/api/v1/me/assessments/{assessmentId}/assistant', {
      params: { path: { assessmentId } },
      body: { message },
    }),
  );
}

export async function submitAssessment(assessmentId: string, idempotencyKey: string) {
  return requireData(
    await api.POST('/api/v1/me/assessments/{assessmentId}/submit', {
      params: { path: { assessmentId }, header: { 'Idempotency-Key': idempotencyKey } },
    }),
  );
}
