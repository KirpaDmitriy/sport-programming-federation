import { createFileRoute, Outlet } from '@tanstack/react-router';
import { metaQueryOptions } from '@/entities/meta';
import { AppShell } from '@/widgets/app-shell';
import { requireRole } from '../../guards';

export const Route = createFileRoute('/employer')({
  beforeLoad: ({ context, location }) => requireRole(context.queryClient, 'employer', location.href),
  loader: ({ context }) => context.queryClient.ensureQueryData(metaQueryOptions()),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
