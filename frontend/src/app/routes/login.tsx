import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { metaQueryOptions } from '@/entities/meta';
import { LoginPage } from '@/pages/login';

const searchSchema = z.object({
  redirect: z.string().startsWith('/').optional().catch(undefined),
  reason: z.enum(['expired']).optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(metaQueryOptions()),
  component: function LoginRoute() {
    const search = Route.useSearch();
    return <LoginPage redirectTo={search.redirect} expired={search.reason === 'expired'} />;
  },
});
