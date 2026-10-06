import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { companyTasksQuery, taskResponsesQuery } from '@/entities/task';
import { EmployerTasksPage } from '@/pages/employer-tasks';

const searchSchema = z.object({ tab: z.enum(['tasks', 'responses']).optional().catch(undefined) });

export const Route = createFileRoute('/employer/tasks')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(companyTasksQuery(scope)),
      queryClient.ensureQueryData(taskResponsesQuery(scope)),
    ]);
  },
  component: function TasksRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <EmployerTasksPage
        tab={search.tab ?? 'tasks'}
        onTabChange={(tab) => void navigate({ search: { tab }, replace: true })}
      />
    );
  },
});
