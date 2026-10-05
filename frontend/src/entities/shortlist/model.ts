import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, requireOk, type Scope } from '@/shared/api';

export type Shortlist = components['schemas']['Shortlist'];
export type ShortlistSummary = components['schemas']['ShortlistSummary'];

export const shortlistsKey = (scope: Scope) => [...scope, 'shortlists'] as const;
export const shortlistKey = (scope: Scope, shortlistId: string) => [...shortlistsKey(scope), shortlistId] as const;

export const shortlistsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: shortlistsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/shortlists', { signal })),
  });

export const shortlistQuery = (scope: Scope, shortlistId: string) =>
  queryOptions({
    queryKey: shortlistKey(scope, shortlistId),
    queryFn: async ({ signal }) =>
      requireData(await api.GET('/api/v1/shortlists/{shortlistId}', { params: { path: { shortlistId } }, signal })),
  });

export async function createShortlist(title: string) {
  return requireData(await api.POST('/api/v1/shortlists', { body: { title } }));
}

export async function renameShortlist(shortlistId: string, title: string) {
  return requireData(
    await api.PATCH('/api/v1/shortlists/{shortlistId}', { params: { path: { shortlistId } }, body: { title } }),
  );
}

export async function deleteShortlist(shortlistId: string) {
  requireOk(await api.DELETE('/api/v1/shortlists/{shortlistId}', { params: { path: { shortlistId } } }));
}

export async function addShortlistMember(shortlistId: string, candidateId: string) {
  return requireData(
    await api.PUT('/api/v1/shortlists/{shortlistId}/members/{candidateId}', {
      params: { path: { shortlistId, candidateId } },
    }),
  );
}

export async function removeShortlistMember(shortlistId: string, candidateId: string) {
  return requireData(
    await api.DELETE('/api/v1/shortlists/{shortlistId}/members/{candidateId}', {
      params: { path: { shortlistId, candidateId } },
    }),
  );
}
