import { requireData, type FspClient } from '../../../shared/api';

export async function importProfilePdf(client: FspClient, file: File, signal?: AbortSignal) {
  const response = await client.POST('/api/v1/me/profile/imports', {
    body: { file },
    ...(signal ? { signal } : {}),
    bodySerializer(body) {
      const form = new FormData();
      form.set('file', body.file, file.name);
      return form;
    },
  });
  return requireData(response);
}

export async function exportProfilePdf(client: FspClient, signal?: AbortSignal) {
  const response = await client.GET('/api/v1/me/profile/export', {
    parseAs: 'blob',
    ...(signal ? { signal } : {}),
  });
  return requireData(response);
}
