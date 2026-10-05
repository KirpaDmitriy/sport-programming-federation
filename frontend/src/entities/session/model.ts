import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Session = components['schemas']['Session'];

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ['session'] as const,
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/session', { signal })),
    retry: false,
    staleTime: 30_000,
  });

export const scopeOf = (session: Session): Scope => [session.role, session.actorId, session.companyId];

export function useSession() {
  return useSuspenseQuery(sessionQueryOptions()).data;
}

export function useScope() {
  return scopeOf(useSession());
}
