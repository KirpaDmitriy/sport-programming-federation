import { createFileRoute } from '@tanstack/react-router';
import { needsQuery } from '@/entities/need';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerNeedsPage } from '@/pages/employer-needs';

export const Route = createFileRoute('/employer/needs/')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(needsQuery(scopeOf(session)));
  },
  component: EmployerNeedsPage,
});
