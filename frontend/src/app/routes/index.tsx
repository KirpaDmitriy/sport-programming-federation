import { createFileRoute, redirect } from '@tanstack/react-router';
import { homeFor, loadSession } from '../guards';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context.queryClient);
    throw redirect({ to: session ? homeFor(session.role) : '/login' });
  },
});
