import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { mySourcesQuery } from '@/entities/source';
import { CandidateSourcesPage } from '@/pages/candidate-sources';

export const Route = createFileRoute('/candidate/sources')({
  loader: async ({ context: { queryClient } }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(mySourcesQuery(scope)),
      queryClient.ensureQueryData(profileQuery(scope)),
    ]);
  },
  component: CandidateSourcesPage,
});
