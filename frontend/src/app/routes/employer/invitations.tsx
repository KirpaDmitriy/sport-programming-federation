import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { companyInvitationsQuery } from '@/entities/invitation';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerInvitationsPage } from '@/pages/employer-invitations';

const searchSchema = z.object({ status: z.enum(['all', 'open', 'accepted', 'closed']).optional().catch(undefined) });

export const Route = createFileRoute('/employer/invitations')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(companyInvitationsQuery(scopeOf(session)));
  },
  component: function InvitationsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <EmployerInvitationsPage
        filter={search.status ?? 'all'}
        onFilterChange={(status) => void navigate({ search: { status }, replace: true })}
      />
    );
  },
});
