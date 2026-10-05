import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { mySourcesQuery } from '@/entities/source';
import { CandidateSettingsPage } from '@/pages/candidate-settings';

export const Route = createFileRoute('/candidate/settings')({
  loader: async ({ context: { queryClient } }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(profileQuery(scope)),
      queryClient.ensureQueryData(mySourcesQuery(scope)),
    ]);
  },
  component: CandidateSettingsPage,
});
