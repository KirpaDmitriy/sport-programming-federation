import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Invitation = components['schemas']['Invitation'];
export type InvitationStatus = Invitation['status'];
export type DisclosureField = components['schemas']['AcceptInvitationInput']['disclose'][number];
type InvitationInput = components['schemas']['InvitationInput'];

export const invitationsKey = (scope: Scope) => [...scope, 'invitations'] as const;
export const isOpenInvitation = (invitation: Invitation) =>
  invitation.status === 'sent' || invitation.status === 'viewed';

export const myInvitationsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: invitationsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/invitations', { signal })),
  });

export const myInvitationQuery = (scope: Scope, invitationId: string) =>
  queryOptions({
    queryKey: [...invitationsKey(scope), invitationId] as const,
    queryFn: async ({ signal }) =>
      requireData(
        await api.GET('/api/v1/me/invitations/{invitationId}', { params: { path: { invitationId } }, signal }),
      ),
  });

const byInvitation = (invitationId: string) => ({ params: { path: { invitationId } } });

export async function markInvitationViewed(invitationId: string) {
  return requireData(await api.POST('/api/v1/me/invitations/{invitationId}/view', byInvitation(invitationId)));
}

export async function acceptInvitation(invitationId: string, disclose: DisclosureField[]) {
  return requireData(
    await api.POST('/api/v1/me/invitations/{invitationId}/accept', {
      ...byInvitation(invitationId),
      body: { disclose },
    }),
  );
}

export async function declineInvitation(invitationId: string) {
  return requireData(await api.POST('/api/v1/me/invitations/{invitationId}/decline', byInvitation(invitationId)));
}

export const companyInvitationsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: invitationsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/invitations', { signal })),
  });

export async function createInvitation(input: InvitationInput, idempotencyKey: string) {
  return requireData(
    await api.POST('/api/v1/invitations', { body: input, params: { header: { 'Idempotency-Key': idempotencyKey } } }),
  );
}

export async function withdrawInvitation(invitationId: string) {
  return requireData(await api.POST('/api/v1/invitations/{invitationId}/withdraw', byInvitation(invitationId)));
}

export const disclosureFieldLabel: Record<DisclosureField, string> = {
  name: 'Имя и фамилия',
  email: 'Email',
  sourceLinks: 'GitHub и ссылки на подтверждения',
};
