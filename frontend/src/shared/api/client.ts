import createClient from 'openapi-fetch';
import { apiOrigin } from '@/shared/config';
import type { paths } from './generated/schema';

export function createFspClient(baseUrl = apiOrigin) {
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    // Resolve fetch per request so interceptors installed after module load (MSW in tests) still apply.
    fetch: (request) => globalThis.fetch(request),
  });
}

export const api = createFspClient();
export type FspClient = typeof api;
