import { api, type components, requireData, requireOk } from '@/shared/api';

type Role = components['schemas']['EmailChallengeInput']['role'];

export async function requestEmailCode(email: string, role: Role) {
  return requireData(await api.POST('/api/v1/auth/email/challenges', { body: { email, role } }));
}

export async function verifyEmailCode(challengeId: string, code: string) {
  return requireData(await api.POST('/api/v1/auth/email/verify', { body: { challengeId, code } }));
}

export async function logout() {
  requireOk(await api.DELETE('/api/v1/auth/session'));
}
