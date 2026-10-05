import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/employer/')({
  beforeLoad: () => {
    throw redirect({ to: '/employer/needs' });
  },
});
