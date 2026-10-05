import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { myInvitationsQuery } from '@/entities/invitation';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateInvitationsPage } from '@/pages/candidate-invitations';

const searchSchema = z.object({ status: z.enum(['all', 'open', 'accepted', 'closed']).optional().catch(undefined) });

export const Route = createFileRoute('/candidate/invitations/')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(myInvitationsQuery(scopeOf(session)));
  },
  component: function InvitationsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CandidateInvitationsPage
        filter={search.status ?? 'all'}
        onFilterChange={(status) => void navigate({ search: { status }, replace: true })}
      />
    );
  },
});
