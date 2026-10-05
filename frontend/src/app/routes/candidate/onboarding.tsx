import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateOnboardingPage } from '@/pages/candidate-onboarding';

export const Route = createFileRoute('/candidate/onboarding')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(profileQuery(scopeOf(session)));
  },
  component: CandidateOnboardingPage,
});
