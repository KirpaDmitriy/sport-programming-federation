import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { sessionQueryOptions } from '@/entities/session';
import type { components } from '@/shared/api';
import { ToastProvider } from '@/shared/ui';

type Options = { session?: components['schemas']['Session']; prefill?: (client: QueryClient) => void };

/** Renders a component inside the real Query, Router and toast providers with an in-memory history. */
export async function renderWithProviders(ui: ReactNode, { session, prefill }: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (session) queryClient.setQueryData(sessionQueryOptions().queryKey, session);
  prefill?.(queryClient);
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) });
  await router.load();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
