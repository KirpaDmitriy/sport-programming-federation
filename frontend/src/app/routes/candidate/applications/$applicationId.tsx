import { createFileRoute } from '@tanstack/react-router';
import { myApplicationQuery } from '@/entities/application';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateApplicationPage } from '@/pages/candidate-application';

export const Route = createFileRoute('/candidate/applications/$applicationId')({
  loader: async ({ context: { queryClient }, params }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await queryClient.ensureQueryData(myApplicationQuery(scope, params.applicationId));
  },
  component: function ApplicationRoute() {
    const { applicationId } = Route.useParams();
    return <CandidateApplicationPage applicationId={applicationId} />;
  },
});
