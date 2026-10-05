import { createFileRoute } from '@tanstack/react-router';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { shortlistsQuery } from '@/entities/shortlist';
import { EmployerShortlistsPage } from '@/pages/employer-shortlists';

export const Route = createFileRoute('/employer/shortlists/')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(shortlistsQuery(scopeOf(session)));
  },
  component: EmployerShortlistsPage,
});
