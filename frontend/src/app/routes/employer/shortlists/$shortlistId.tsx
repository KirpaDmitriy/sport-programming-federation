import { createFileRoute } from '@tanstack/react-router';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { shortlistQuery } from '@/entities/shortlist';
import { EmployerShortlistPage } from '@/pages/employer-shortlist';

export const Route = createFileRoute('/employer/shortlists/$shortlistId')({
  loader: async ({ context: { queryClient }, params }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(shortlistQuery(scopeOf(session), params.shortlistId));
  },
  component: function ShortlistRoute() {
    const { shortlistId } = Route.useParams();
    return <EmployerShortlistPage key={shortlistId} shortlistId={shortlistId} />;
  },
});
