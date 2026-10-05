import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Source = components['schemas']['Source'];
export type Repository = components['schemas']['Repository'];

export const sourcesKey = (scope: Scope) => [...scope, 'sources'] as const;

export const mySourcesQuery = (scope: Scope) =>
  queryOptions({
    queryKey: sourcesKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/sources', { signal })),
  });

export async function connectSource(provider: Source['provider'], account: string) {
  return requireData(
    await api.POST('/api/v1/me/sources/{provider}/connect', { params: { path: { provider } }, body: { account } }),
  );
}

export async function syncSource(sourceId: string) {
  return requireData(await api.POST('/api/v1/me/sources/{sourceId}/sync', { params: { path: { sourceId } } }));
}

export const repositoryStatusLabel: Record<Repository['status'], string> = {
  processed: 'Обработан',
  queued: 'В очереди',
  unavailable: 'Временно недоступен',
};

/** Synthetic fixture links are identifiers, not hosted pages. */
export const isDemoReference = (url: string) => url.startsWith('https://example.com/fixtures/');
