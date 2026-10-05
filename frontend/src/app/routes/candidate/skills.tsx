import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { mySkillsQuery } from '@/entities/skill';
import { CandidateSkillsPage } from '@/pages/candidate-skills';

const searchSchema = z.object({
  view: z.enum(['list', 'graph']).optional().catch(undefined),
  node: z.string().max(120).optional().catch(undefined),
});

export const Route = createFileRoute('/candidate/skills')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(mySkillsQuery(scope)),
      queryClient.ensureQueryData(profileQuery(scope)),
    ]);
  },
  component: function SkillsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CandidateSkillsPage
        view={search.view ?? 'list'}
        selected={search.node}
        onChange={(next) => void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })}
      />
    );
  },
});
