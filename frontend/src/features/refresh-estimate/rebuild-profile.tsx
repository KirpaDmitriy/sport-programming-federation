import { useState } from 'react';
import { describeError } from '@/shared/api';
import { Button, Callout, ConfirmDialog } from '@/shared/ui';
import { useRefreshEstimate } from './use-refresh-estimate';

/** Replaces every questionnaire answer but the name with the one the connected sources give. */
export function RebuildProfileButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rebuild = useRefreshEstimate();
  return (
    <>
      <Button size="sm" icon="sparkles" onClick={() => setOpen(true)} disabled={disabled}>
        Заполнить анкету по источникам
      </Button>
      <ConfirmDialog
        open={open}
        title="Заполнить анкету по источникам?"
        confirmLabel="Заполнить"
        pending={rebuild.isPending}
        onConfirm={() => rebuild.mutate('replace', { onSuccess: () => setOpen(false) })}
        onCancel={() => {
          setOpen(false);
          rebuild.reset();
        }}
      >
        <div className="stack">
          <p>
            Специализация, целевой грейд, стек, опыт, роль в команде и навыки заменятся данными из GitHub и ФСП. Имя
            останется вашим, подтверждённая тестом категория не изменится.
          </p>
          <p className="small muted">
            Стаж возьмётся из публичной активности. Если опыта больше, укажите его в анкете: оценка пересчитается сразу.
          </p>
          {rebuild.error && <Callout tone="danger">{describeError(rebuild.error).message}</Callout>}
        </div>
      </ConfirmDialog>
    </>
  );
}
