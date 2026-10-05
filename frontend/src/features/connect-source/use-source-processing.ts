import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Job, useJob } from '@/entities/job';
import { profileKey } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { graphKey, skillsKey } from '@/entities/skill';
import { type Source, sourcesKey, syncSource } from '@/entities/source';

/** Follows the source's active job (resumed after reload) and refreshes everything enrichment can change. */
export function useSourceProcessing(source: Source | undefined) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      [sourcesKey(scope), skillsKey(scope), graphKey(scope), profileKey(scope)].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  const job = useJob(scope, source?.activeJobId ?? null, () => void refresh());
  const sync = useMutation({
    mutationFn: () => {
      if (!source) throw new Error('Источник не найден');
      return syncSource(source.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourcesKey(scope) }),
  });
  const lastFailure: Job['error'] = job.data?.status === 'failed' ? job.data.error : null;
  return {
    job: job.data,
    processing: Boolean(source?.activeJobId) && job.data?.status !== 'failed',
    lastFailure,
    sync,
  };
}
