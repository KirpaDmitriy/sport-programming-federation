import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/candidate/')({
  beforeLoad: () => {
    throw redirect({ to: '/candidate/overview' });
  },
});
