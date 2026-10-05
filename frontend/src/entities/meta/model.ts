import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { api, type components, requireData } from '@/shared/api';

export type Meta = components['schemas']['Meta'];
export type SkillId = Meta['skills'][number]['id'];
export type Competition = Meta['competitions'][number];

export const metaQueryOptions = () =>
  queryOptions({
    queryKey: ['meta'] as const,
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/meta', { signal })),
    staleTime: 30_000,
  });

export function useMeta() {
  return useSuspenseQuery(metaQueryOptions()).data;
}

export function skillLabel(meta: Meta, id: SkillId) {
  return meta.skills.find((skill) => skill.id === id)?.label ?? id;
}

export function competitionsForSkill(meta: Meta, id: SkillId) {
  return meta.competitions.filter((competition) => competition.skillIds.includes(id));
}
