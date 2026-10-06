import { createFileRoute } from '@tanstack/react-router';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { myTasksQuery } from '@/entities/task';
import { CandidateTasksPage } from '@/pages/candidate-tasks';

export const Route = createFileRoute('/candidate/tasks')({
  loader: async ({ context: { queryClient } }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await queryClient.ensureQueryData(myTasksQuery(scope));
  },
  component: CandidateTasksPage,
});
