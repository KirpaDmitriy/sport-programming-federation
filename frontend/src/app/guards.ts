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

/**
 * Revalidates the session on every protected navigation, so an expired cookie is noticed before cached
 * private data is shown again.
 */
export async function requireRole(queryClient: QueryClient, role: Session['role'], href: string) {
  const hadSession = queryClient.getQueryData(sessionQueryOptions().queryKey) !== undefined;
  let session: Session;
  try {
    session = await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
  } catch (error) {
    if (!isApiError(error, 401)) throw error;
    queryClient.clear();
    throw redirect({ to: '/login', search: { redirect: href, ...(hadSession ? { reason: 'expired' as const } : {}) } });
  }
  if (session.role !== role) throw new RoleMismatchError(session.role);
  return session;
}
