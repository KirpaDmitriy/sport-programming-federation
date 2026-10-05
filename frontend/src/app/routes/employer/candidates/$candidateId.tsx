import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { candidateQuery } from '@/entities/candidate';
import { needsQuery } from '@/entities/need';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { shortlistsQuery } from '@/entities/shortlist';
import { EmployerCandidatePage } from '@/pages/employer-candidate';

const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/);
const searchSchema = z.object({
  needId: id.optional().catch(undefined),
  tab: z.enum(['match', 'skills', 'checks']).optional().catch(undefined),
  shortlistId: id.optional().catch(undefined),
});

export const Route = createFileRoute('/employer/candidates/$candidateId')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ needId: search.needId }),
  loader: async ({ context: { queryClient }, params, deps }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(candidateQuery(scope, params.candidateId, deps.needId)),
      queryClient.ensureQueryData(needsQuery(scope)),
      queryClient.ensureQueryData(shortlistsQuery(scope)),
    ]);
  },
  component: function CandidateRoute() {
    const { candidateId } = Route.useParams();
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <EmployerCandidatePage
        candidateId={candidateId}
        needId={search.needId}
        tab={search.tab ?? (search.needId ? 'match' : 'skills')}
        shortlistId={search.shortlistId}
        onChange={(patch) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true })}
      />
    );
  },
});
