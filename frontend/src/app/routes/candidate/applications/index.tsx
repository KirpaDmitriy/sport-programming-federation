import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { myApplicationsQuery } from '@/entities/application';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateApplicationsPage } from '@/pages/candidate-applications';

const searchSchema = z.object({ status: z.enum(['all', 'open', 'accepted', 'closed']).optional().catch(undefined) });

export const Route = createFileRoute('/candidate/applications/')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(myApplicationsQuery(scopeOf(session)));
  },
  component: function ApplicationsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CandidateApplicationsPage
        filter={search.status ?? 'all'}
        onFilterChange={(status) => void navigate({ search: { status }, replace: true })}
      />
    );
  },
});
