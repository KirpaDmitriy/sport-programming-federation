import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { needQuery } from '@/entities/need';
import { scopeOf, sessionQueryOptions, useScope } from '@/entities/session';
import { EmployerNeedEditorPage } from '@/pages/employer-need-editor';

export const Route = createFileRoute('/employer/needs/$needId')({
  loader: async ({ context: { queryClient }, params }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(needQuery(scopeOf(session), params.needId));
  },
  component: function NeedRoute() {
    const { needId } = Route.useParams();
    const { data } = useSuspenseQuery(needQuery(useScope(), needId));
    return <EmployerNeedEditorPage key={data.id} need={data} />;
  },
});
