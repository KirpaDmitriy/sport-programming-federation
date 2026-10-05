import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, requireOk, type Scope } from '@/shared/api';

export type Need = components['schemas']['Need'];
export type NeedInput = components['schemas']['NeedInput'];
export type Requirement = components['schemas']['Requirement'];
export type EvidencePolicy = components['schemas']['EvidencePolicy'];

export const needsKey = (scope: Scope) => [...scope, 'needs'] as const;

export const needsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: needsKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/needs', { signal })),
  });

export const needQuery = (scope: Scope, needId: string) =>
  queryOptions({
    queryKey: [...needsKey(scope), needId] as const,
    queryFn: async ({ signal }) =>
      requireData(await api.GET('/api/v1/needs/{needId}', { params: { path: { needId } }, signal })),
  });

export async function createNeed(input: NeedInput) {
  return requireData(await api.POST('/api/v1/needs', { body: input }));
}

export async function updateNeed(needId: string, input: NeedInput) {
  return requireData(await api.PATCH('/api/v1/needs/{needId}', { params: { path: { needId } }, body: input }));
}

export async function deleteNeed(needId: string) {
  requireOk(await api.DELETE('/api/v1/needs/{needId}', { params: { path: { needId } } }));
}

export const defaultEvidencePolicy = (): EvidencePolicy => ({
  acceptAssessments: true,
  acceptGithub: true,
  acceptFsp: true,
  competitionSelection: 'system',
  competitionIds: [],
});

export function describePolicy(policy: EvidencePolicy) {
  const sources = [
    policy.acceptAssessments && 'практические проверки',
    policy.acceptGithub && 'работа в GitHub',
    policy.acceptFsp && (policy.competitionSelection === 'system' ? 'соревнования ФСП' : 'выбранные соревнования ФСП'),
  ].filter(Boolean);
  return sources.length ? sources.join(', ') : 'источники не выбраны';
}
