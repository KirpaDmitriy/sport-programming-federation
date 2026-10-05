import { createFileRoute } from '@tanstack/react-router';
import { assessmentQuery } from '@/entities/assessment';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { AssessmentResultPage } from '@/pages/assessment-result';

export const Route = createFileRoute('/candidate/assessments/$assessmentId/result')({
  loader: async ({ context: { queryClient }, params }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(assessmentQuery(scopeOf(session), params.assessmentId));
  },
  component: function ResultRoute() {
    const { assessmentId } = Route.useParams();
    return <AssessmentResultPage assessmentId={assessmentId} />;
  },
});
