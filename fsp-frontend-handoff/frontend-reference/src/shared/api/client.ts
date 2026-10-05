import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

type ClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

export function createFspClient(options: ClientOptions = {}) {
  return createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    credentials: 'include',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export type FspClient = ReturnType<typeof createFspClient>;
