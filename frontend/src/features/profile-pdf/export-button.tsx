import { useMutation } from '@tanstack/react-query';
import { describeError } from '@/shared/api';
import { Button } from '@/shared/ui';
import { exportProfilePdf } from './api';

export function ExportProfileButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' }) {
  const exportPdf = useMutation({
    mutationFn: exportProfilePdf,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fsp-profile.pdf';
      document.body.append(link);
      link.click();
      link.remove();
      // Revoke after the click has been dispatched so the download can start.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <div className="stack" style={{ gap: '0.375rem', justifyItems: 'end' }}>
      <Button
        variant={variant}
        icon="download"
        onClick={() => exportPdf.mutate()}
        pending={exportPdf.isPending}
        pendingLabel="Готовим PDF…"
      >
        {exportPdf.isError ? 'Повторить скачивание' : 'Скачать PDF'}
      </Button>
      {exportPdf.isError && (
        <span className="small" role="alert" style={{ color: 'var(--fsp-color-danger)' }}>
          Не удалось сформировать PDF. {describeError(exportPdf.error).message}
        </span>
      )}
    </div>
  );
}
