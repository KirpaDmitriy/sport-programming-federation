import { queryOptions } from '@tanstack/react-query';
import { requireData, type FspClient } from '../../../shared/api';

export function sessionQueryOptions(client: FspClient) {
  return queryOptions({
    queryKey: ['session'] as const,
    queryFn: async ({ signal }) => requireData(await client.GET('/api/v1/session', { signal })),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
