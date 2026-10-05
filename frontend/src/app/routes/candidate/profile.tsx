import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateProfilePage } from '@/pages/candidate-profile';

export const Route = createFileRoute('/candidate/profile')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(profileQuery(scopeOf(session)));
  },
  component: CandidateProfilePage,
});
