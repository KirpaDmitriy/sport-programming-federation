import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Company = components['schemas']['Company'];
export type CompanyPatch = components['schemas']['CompanyPatch'];

export const companyKey = (scope: Scope) => [...scope, 'company'] as const;

export const companyQuery = (scope: Scope) =>
  queryOptions({
    queryKey: companyKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/company', { signal })),
  });

export async function updateCompany(patch: CompanyPatch) {
  return requireData(await api.PATCH('/api/v1/company', { body: patch }));
}

export function companyInitials(company: Pick<Company, 'displayName'>) {
  return company.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
