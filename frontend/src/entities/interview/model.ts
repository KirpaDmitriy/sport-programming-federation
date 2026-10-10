import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Interview = components['schemas']['Interview'];
export type InterviewNode = components['schemas']['InterviewNode'];
export type InterviewAnswerInput = components['schemas']['InterviewAnswerInput'];

export const interviewsKey = (scope: Scope) => [...scope, 'interviews'] as const;
export const interviewKey = (scope: Scope, id: string) => [...scope, 'interviews', id] as const;

export const interviewsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: interviewsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/interviews', { signal })),
  });

export async function startInterview() {
  return requireData(
    await api.POST('/api/v1/me/interviews', {
      body: { blueprintId: 'backend-middle-v1', maxTurns: 10 },
    }),
  );
}

export async function answerInterview(id: string, input: InterviewAnswerInput) {
  return requireData(
    await api.POST('/api/v1/me/interviews/{interviewId}/answers', {
      params: { path: { interviewId: id } },
      body: input,
    }),
  );
}
