import { QueryClient } from '@tanstack/react-query';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { candidateSearchQueryOptions } from '../src/entities/candidate';
import { sessionQueryOptions } from '../src/entities/session';
import { ApiResponseError, createFspClient, requireData, type components } from '../src/shared/api';

const session = {
  actorId: 'actor-candidate-024',
  role: 'candidate',
  emailVerified: true,
  candidateId: 'candidate-024',
  companyId: null,
  displayName: 'Алексей Морозов',
} satisfies components['schemas']['Session'];

describe('typed API boundary', () => {
  it('uses the canonical path once and includes session credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(session));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });
    const queryClient = new QueryClient();
    const result = await queryClient.fetchQuery(sessionQueryOptions(client));

    expect(result).toEqual(session);
    expectTypeOf(result).toEqualTypeOf<components['schemas']['Session']>();
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error('Expected a Request object.');
    expect(request.url).toBe('http://127.0.0.1:4010/api/v1/session');
    expect(request.credentials).toBe('include');
    queryClient.clear();
  });

  it('preserves API failures instead of returning successful fixtures', async () => {
    const problem = { code: 'FORBIDDEN', message: 'Недостаточно прав.', requestId: 'request-1', details: [] } satisfies components['schemas']['Error'];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(problem, { status: 403 }));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });
    const queryClient = new QueryClient();

    await expect(queryClient.fetchQuery(sessionQueryOptions(client))).rejects.toMatchObject({
      name: 'ApiResponseError', status: 403, problem,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it('forwards cancellation to the request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(session));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });
    const controller = new AbortController();
    await client.GET('/api/v1/session', { signal: controller.signal });
    controller.abort();

    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Expected a Request object.');
    expect(request.signal.aborted).toBe(true);
  });

  it('partitions candidate cache entries by employer and search filters', () => {
    const client = createFspClient();
    const employerA = { actorId: 'employer-a', companyId: 'company-a' };
    const employerB = { actorId: 'employer-b', companyId: 'company-b' };
    const bank = candidateSearchQueryOptions(client, employerA);
    const otherCompany = candidateSearchQueryOptions(client, employerB);
    const recommended = candidateSearchQueryOptions(client, employerA, { mode: 'recommended', needId: 'need-1' });

    expect(bank.queryKey).not.toEqual(otherCompany.queryKey);
    expect(bank.queryKey).not.toEqual(recommended.queryKey);
  });

  it('keeps owner-only identity fields out of the anonymous DTO type', () => {
    expectTypeOf<components['schemas']['AnonymousCandidate']>().not.toHaveProperty('email');
    expectTypeOf<components['schemas']['AnonymousCandidate']>().not.toHaveProperty('name');
    expectTypeOf<components['schemas']['AnonymousCandidate']>().not.toHaveProperty('githubUrl');
    expectTypeOf<components['schemas']['Profile']>().toHaveProperty('email');
  });

  it('rejects missing required success data and preserves status on empty errors', () => {
    expect(() => requireData({ response: new Response(null, { status: 200 }) })).toThrow('no data');
    expect(() => requireData({ response: new Response(null, { status: 503 }) })).toThrow(ApiResponseError);
  });
});
