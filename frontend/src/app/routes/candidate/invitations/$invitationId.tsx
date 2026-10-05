import { createFileRoute } from '@tanstack/react-router';
import { myInvitationQuery } from '@/entities/invitation';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { CandidateInvitationPage } from '@/pages/candidate-invitation';

export const Route = createFileRoute('/candidate/invitations/$invitationId')({
  loader: async ({ context: { queryClient }, params }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(myInvitationQuery(scope, params.invitationId)),
      queryClient.ensureQueryData(profileQuery(scope)),
    ]);
  },
  component: function InvitationRoute() {
    const { invitationId } = Route.useParams();
    return <CandidateInvitationPage invitationId={invitationId} />;
  },
});
