import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Job = components['schemas']['Job'];

export const isTerminalJob = (job: Job | undefined) => job?.status === 'succeeded' || job?.status === 'failed';

export const jobQuery = (scope: Scope, jobId: string) =>
  queryOptions({
    queryKey: [...scope, 'job', jobId] as const,
    queryFn: async ({ signal }) =>
      requireData(await api.GET('/api/v1/jobs/{jobId}', { params: { path: { jobId } }, signal })),
    // Polling follows the server hint and stops at a terminal state.
    refetchInterval: (query) =>
      isTerminalJob(query.state.data) ? false : Math.max(query.state.data?.pollAfterMs ?? 250, 250),
    retry: 2,
  });

/** Observes a background job and calls `onSettled` once when it reaches a terminal state. */
export function useJob(scope: Scope, jobId: string | null, onSettled?: (job: Job) => void) {
  const query = useQuery({ ...jobQuery(scope, jobId ?? 'none'), enabled: Boolean(jobId) });
  const reported = useRef<string | null>(null);
  const callback = useRef(onSettled);
  callback.current = onSettled;
  const job = query.data;
  useEffect(() => {
    if (job && isTerminalJob(job) && reported.current !== job.id) {
      reported.current = job.id;
      callback.current?.(job);
    }
  }, [job]);
  return query;
}
