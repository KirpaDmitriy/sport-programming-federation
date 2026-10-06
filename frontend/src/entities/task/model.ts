import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type MyTasks = components['schemas']['MyTasks'];
export type OfferedTask = components['schemas']['OfferedTask'];
export type Task = components['schemas']['Task'];
export type TaskInput = components['schemas']['TaskInput'];
export type TaskResponse = components['schemas']['TaskResponse'];
type TaskResponseInput = components['schemas']['TaskResponseInput'];
type TaskReviewInput = components['schemas']['TaskReviewInput'];

export const tasksKey = (scope: Scope) => [...scope, 'tasks'] as const;

export const myTasksQuery = (scope: Scope) =>
  queryOptions({
    queryKey: tasksKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/tasks', { signal })),
  });

export async function respondToTask(taskId: string, input: TaskResponseInput, idempotencyKey: string) {
  return requireData(
    await api.POST('/api/v1/me/tasks/{taskId}/responses', {
      params: { path: { taskId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: input,
    }),
  );
}

export const companyTasksQuery = (scope: Scope) =>
  queryOptions({
    queryKey: [...tasksKey(scope), 'authored'] as const,
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/tasks', { signal })),
  });

export const taskResponsesQuery = (scope: Scope) =>
  queryOptions({
    queryKey: [...tasksKey(scope), 'responses'] as const,
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/task-responses', { signal })),
  });

export async function createTask(input: TaskInput) {
  return requireData(await api.POST('/api/v1/tasks', { body: input }));
}

export async function archiveTask(taskId: string) {
  return requireData(await api.POST('/api/v1/tasks/{taskId}/archive', { params: { path: { taskId } } }));
}

export async function reviewTaskResponse(responseId: string, input: TaskReviewInput) {
  return requireData(
    await api.POST('/api/v1/task-responses/{responseId}/review', { params: { path: { responseId } }, body: input }),
  );
}

export const taskModeLabel: Record<TaskResponse['mode'], string> = {
  solution: 'Решение',
  approach: 'Подход к решению',
};
