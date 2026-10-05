import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { exportProfilePdf, importProfilePdf } from '../src/features/profile-documents';
import { createFspClient, type components } from '../src/shared/api';

const job = {
  id: 'profile-import-1',
  kind: 'profile_import',
  status: 'queued',
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
  result: null,
  error: null,
  pollAfterMs: 1000,
  simulation: true,
} satisfies components['schemas']['Job'];

describe('profile PDF transfer', () => {
  it('serializes a typed file with a browser-generated multipart boundary', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(job, { status: 202 }));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });
    const file = new File(['%PDF-1.4\nfixture'], 'resume.pdf', { type: 'application/pdf' });
    const result = await importProfilePdf(client, file);

    expectTypeOf(result).toEqualTypeOf<components['schemas']['Job']>();
    expect(result).toEqual(job);
    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Expected a Request object.');
    expect(request.url).toBe('http://127.0.0.1:4010/api/v1/me/profile/imports');
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    const submitted = (await request.formData()).get('file');
    if (!(submitted instanceof File)) throw new Error('Expected a multipart file.');
    expect(submitted.name).toBe(file.name);
    expect(submitted.type).toBe('application/pdf');
    expect(await submitted.text()).toBe(await file.text());
  });

  it('returns the PDF as a Blob instead of trying to parse JSON', async () => {
    const pdf = new Blob(['%PDF-1.4\nfixture'], { type: 'application/pdf' });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(pdf));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });
    const result = await exportProfilePdf(client);

    expectTypeOf(result).toEqualTypeOf<Blob>();
    expect(result.type).toBe('application/pdf');
    expect(await result.text()).toBe(await pdf.text());
    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Expected a Request object.');
    expect(request.url).toBe('http://127.0.0.1:4010/api/v1/me/profile/export');
  });

  it('keeps the JSON error envelope for a failed PDF download', async () => {
    const problem = { code: 'UNAUTHORIZED', message: 'Сессия истекла.', requestId: 'request-pdf-1', details: [] } satisfies components['schemas']['Error'];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(problem, { status: 401 }));
    const client = createFspClient({ baseUrl: 'http://127.0.0.1:4010', fetch });

    await expect(exportProfilePdf(client)).rejects.toMatchObject({ status: 401, problem });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
