import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { companyApplicationsQuery } from '@/entities/application';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerApplicationsPage } from '@/pages/employer-applications';

const searchSchema = z.object({
  status: z.enum(['all', 'open', 'accepted', 'closed']).optional().catch(undefined),
  needId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,100}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/employer/applications/')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(companyApplicationsQuery(scopeOf(session)));
  },
  component: function ApplicationsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <EmployerApplicationsPage
        filter={search.status ?? 'all'}
        needId={search.needId}
        onChange={(patch) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true })}
      />
    );
  },
});
