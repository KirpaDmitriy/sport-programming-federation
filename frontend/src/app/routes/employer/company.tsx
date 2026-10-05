import { createFileRoute } from '@tanstack/react-router';
import { companyQuery } from '@/entities/company';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerCompanyPage } from '@/pages/employer-company';

export const Route = createFileRoute('/employer/company')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(companyQuery(scopeOf(session)));
  },
  component: EmployerCompanyPage,
});
