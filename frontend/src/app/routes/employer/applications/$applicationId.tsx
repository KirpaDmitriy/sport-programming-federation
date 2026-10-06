import { createFileRoute } from '@tanstack/react-router';
import { companyApplicationQuery } from '@/entities/application';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerApplicationPage } from '@/pages/employer-application';

export const Route = createFileRoute('/employer/applications/$applicationId')({
  loader: async ({ context: { queryClient }, params }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await queryClient.ensureQueryData(companyApplicationQuery(scope, params.applicationId));
  },
  component: function ApplicationRoute() {
    const { applicationId } = Route.useParams();
    return <EmployerApplicationPage applicationId={applicationId} />;
  },
});
