import { createFileRoute } from '@tanstack/react-router';
import { assessmentQuery } from '@/entities/assessment';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { AssessmentWorkspacePage } from '@/pages/assessment-workspace';

export const Route = createFileRoute('/candidate/assessments/$assessmentId/workspace')({
  loader: async ({ context: { queryClient }, params }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(assessmentQuery(scopeOf(session), params.assessmentId));
  },
  component: function WorkspaceRoute() {
    const { assessmentId } = Route.useParams();
    return <AssessmentWorkspacePage assessmentId={assessmentId} />;
  },
});
