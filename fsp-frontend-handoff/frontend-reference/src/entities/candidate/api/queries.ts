import { queryOptions } from '@tanstack/react-query';
import { requireData, type FspClient, type paths } from '../../../shared/api';

type CandidateSearch = NonNullable<paths['/api/v1/candidates']['get']['parameters']['query']>;
type EmployerScope = { actorId: string; companyId: string };

export function candidateSearchQueryOptions(
  client: FspClient,
  scope: EmployerScope,
  filters: CandidateSearch = {},
) {
  const query = { mode: 'bank' as const, page: 1, pageSize: 10, fsp: 'any' as const, ...filters };
  return queryOptions({
    queryKey: ['employer', scope.actorId, scope.companyId, 'candidates', query] as const,
    queryFn: async ({ signal }) => requireData(await client.GET('/api/v1/candidates', { params: { query }, signal })),
    retry: false,
  });
}
