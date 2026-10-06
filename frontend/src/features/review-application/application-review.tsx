import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type Application,
  acceptApplication,
  applicationsKey,
  declineApplication,
  isOpenApplication,
} from '@/entities/application';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { Button, Callout, Card, ConfirmDialog } from '@/shared/ui';

/** The company's decision on a self-application; the candidate sees the status at once. */
export function ApplicationReview({ application }: { application: Application }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const settle = async (updated?: Application) => {
    if (updated) queryClient.setQueryData([...applicationsKey(scope), application.id], updated);
    await queryClient.invalidateQueries({ queryKey: applicationsKey(scope) });
  };
  const onError = (error: unknown) => {
    // The candidate may have withdrawn meanwhile; show the canonical record.
    if (isApiError(error, 409)) void settle();
  };
  const accept = useMutation({ mutationFn: () => acceptApplication(application.id), onSuccess: settle, onError });
  const decline = useMutation({
    mutationFn: () => declineApplication(application.id),
    onSuccess: async (updated) => {
      setConfirmDecline(false);
      await settle(updated);
    },
    onError,
  });
  const error = accept.error ?? decline.error;
  const alias = application.candidateAlias;

  if (application.status === 'accepted') {
    return (
      <Card title="Вы приняли отклик">
        <p>
          {application.respondedAt ? `${formatDateTime(application.respondedAt)}. ` : ''}
          Кандидат видит, что вы готовы к разговору. Свяжитесь с ним по открытым контактам.
        </p>
      </Card>
    );
  }
  if (application.status === 'declined') {
    return (
      <Card title="Вы отклонили отклик">
        <p>Кандидат {alias} видит отказ. Условия вакансии и письмо сохранены в истории.</p>
      </Card>
    );
  }
  if (application.status === 'withdrawn') {
    return (
      <Card title="Отклик отозван">
        <p>Кандидат отозвал отклик. Контакты, открытые этим откликом, больше недоступны.</p>
      </Card>
    );
  }
  return (
    <Card title="Решение по отклику">
      <div className="stack">
        <p className="muted">Кандидат увидит ваше решение в своём кабинете.</p>
        {error != null && (
          <Callout tone={isApiError(error, 409) ? 'warning' : 'danger'} role="alert">
            {isApiError(error, 409)
              ? 'Статус отклика уже изменился — показано актуальное состояние.'
              : `Решение не сохранено: ${describeError(error).message}`}
          </Callout>
        )}
        <Button
          variant="primary"
          block
          disabled={!isOpenApplication(application) || decline.isPending}
          pending={accept.isPending}
          pendingLabel="Сохраняем решение…"
          onClick={() => accept.mutate()}
        >
          Принять и перейти к разговору
        </Button>
        <Button block disabled={accept.isPending || decline.isPending} onClick={() => setConfirmDecline(true)}>
          Отклонить
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDecline}
        title="Отклонить отклик?"
        confirmLabel="Отклонить"
        danger
        pending={decline.isPending}
        onConfirm={() => decline.mutate()}
        onCancel={() => setConfirmDecline(false)}
      >
        <p>Кандидат {alias} увидит отказ. Изменить решение будет нельзя.</p>
      </ConfirmDialog>
    </Card>
  );
}
