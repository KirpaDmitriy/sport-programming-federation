import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateAssessmentsPage } from '@/pages/candidate-assessments';

export const Route = createFileRoute('/candidate/assessments/')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(profileQuery(scopeOf(session)));
  },
  component: CandidateAssessmentsPage,
});
