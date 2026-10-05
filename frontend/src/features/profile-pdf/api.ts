import { api, type components, requireData } from '@/shared/api';

export async function exportProfilePdf() {
  return requireData(await api.GET('/api/v1/me/profile/export', { parseAs: 'blob' }));
}

export async function importProfilePdf(file: File) {
  return requireData(
    await api.POST('/api/v1/me/profile/imports', {
      body: { file },
      // The browser must set the multipart boundary itself, so no Content-Type header is added here.
      bodySerializer(body) {
        const form = new FormData();
        form.set('file', body.file, file.name);
        return form;
      },
    }),
  );
}

export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export function validatePdf(file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
    return 'Выберите файл в формате PDF.';
  if (file.size === 0) return 'Файл пустой. Выберите другой PDF.';
  if (file.size > MAX_PDF_BYTES) return 'Размер PDF не должен превышать 2 МиБ.';
  return null;
}

export async function confirmProfileImport(jobId: string, profile: components['schemas']['ProfilePatch']) {
  return requireData(
    await api.POST('/api/v1/me/profile/imports/{jobId}/confirm', { params: { path: { jobId } }, body: { profile } }),
  );
}
