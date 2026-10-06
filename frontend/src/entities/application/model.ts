import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Application = components['schemas']['Application'];
export type ApplicationStatus = Application['status'];
type ApplicationInput = components['schemas']['ApplicationInput'];

export const applicationsKey = (scope: Scope) => [...scope, 'applications'] as const;
export const isOpenApplication = (application: Application) =>
  application.status === 'sent' || application.status === 'viewed';

export const myApplicationsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: applicationsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/applications', { signal })),
  });

export const myApplicationQuery = (scope: Scope, applicationId: string) =>
  queryOptions({
    queryKey: [...applicationsKey(scope), applicationId] as const,
    queryFn: async ({ signal }) =>
      requireData(
        await api.GET('/api/v1/me/applications/{applicationId}', { params: { path: { applicationId } }, signal }),
      ),
  });

const byApplication = (applicationId: string) => ({ params: { path: { applicationId } } });

export async function createApplication(input: ApplicationInput, idempotencyKey: string) {
  return requireData(
    await api.POST('/api/v1/me/applications', {
      body: input,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    }),
  );
}

export async function withdrawApplication(applicationId: string) {
  return requireData(await api.POST('/api/v1/me/applications/{applicationId}/withdraw', byApplication(applicationId)));
}

export const companyApplicationsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: applicationsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/applications', { signal })),
  });

export const companyApplicationQuery = (scope: Scope, applicationId: string) =>
  queryOptions({
    queryKey: [...applicationsKey(scope), applicationId] as const,
    queryFn: async ({ signal }) =>
      requireData(
        await api.GET('/api/v1/applications/{applicationId}', { params: { path: { applicationId } }, signal }),
      ),
  });

export async function markApplicationViewed(applicationId: string) {
  return requireData(await api.POST('/api/v1/applications/{applicationId}/view', byApplication(applicationId)));
}

export async function acceptApplication(applicationId: string) {
  return requireData(await api.POST('/api/v1/applications/{applicationId}/accept', byApplication(applicationId)));
}

export async function declineApplication(applicationId: string) {
  return requireData(await api.POST('/api/v1/applications/{applicationId}/decline', byApplication(applicationId)));
}
