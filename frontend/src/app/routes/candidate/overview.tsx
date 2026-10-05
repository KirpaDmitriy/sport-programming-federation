import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateOverviewPage } from '@/pages/candidate-overview';

export const Route = createFileRoute('/candidate/overview')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(profileQuery(scopeOf(session)));
  },
  component: CandidateOverviewPage,
});
