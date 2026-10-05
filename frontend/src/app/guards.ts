import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { type Session, sessionQueryOptions } from '@/entities/session';
import { isApiError } from '@/shared/api';

export class RoleMismatchError extends Error {
  readonly actualRole: Session['role'];

  constructor(actualRole: Session['role']) {
    super('Раздел недоступен для этой роли');
    this.actualRole = actualRole;
  }
}

export const homeFor = (role: Session['role']) => (role === 'candidate' ? '/candidate/overview' : '/employer/needs');

export async function loadSession(queryClient: QueryClient) {
  try {
    return await queryClient.ensureQueryData(sessionQueryOptions());
  } catch (error) {
    if (isApiError(error, 401)) return null;
    throw error;
  }
}

export async function requireRole(queryClient: QueryClient, role: Session['role'], href: string) {
  const session = await loadSession(queryClient);
  if (!session) throw redirect({ to: '/login', search: { redirect: href } });
  if (session.role !== role) throw new RoleMismatchError(session.role);
  return session;
}
