import { createFileRoute } from '@tanstack/react-router';
import { companyQuery } from '@/entities/company';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { EmployerSettingsPage } from '@/pages/employer-settings';

export const Route = createFileRoute('/employer/settings')({
  loader: async ({ context: { queryClient } }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    await queryClient.ensureQueryData(companyQuery(scopeOf(session)));
  },
  component: EmployerSettingsPage,
});
