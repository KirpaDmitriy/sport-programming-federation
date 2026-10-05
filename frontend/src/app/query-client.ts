import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';

/** Retries only transport failures and 5xx once; client errors are answers, not glitches. */
function shouldRetry(failureCount: number, error: unknown) {
  if (isApiError(error) && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(onUnauthorized: () => void) {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isApiError(error, 401) && query.queryKey[0] !== 'session') onUnauthorized();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isApiError(error, 401)) onUnauthorized();
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 10_000 },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
