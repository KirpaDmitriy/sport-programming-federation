import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Application, applicationsKey, isOpenApplication, withdrawApplication } from '@/entities/application';
import { useScope } from '@/entities/session';
import { vacanciesKey } from '@/entities/vacancy';
import { describeError, isApiError } from '@/shared/api';
import { Button, Callout, ConfirmDialog } from '@/shared/ui';

/** Withdrawing closes the application and takes back the contacts it opened, unless another grant remains. */
export function WithdrawApplication({ application }: { application: Application }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const withdraw = useMutation({
    mutationFn: () => withdrawApplication(application.id),
    onSuccess: (updated) => {
      setConfirm(false);
      queryClient.setQueryData([...applicationsKey(scope), application.id], updated);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationsKey(scope) }),
        queryClient.invalidateQueries({ queryKey: vacanciesKey(scope) }),
      ]),
  });
  if (!isOpenApplication(application)) return null;
  return (
    <>
      <Button block onClick={() => setConfirm(true)}>
        Отозвать отклик
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Отозвать отклик?"
        confirmLabel="Отозвать"
        danger
        pending={withdraw.isPending}
        onConfirm={() => withdraw.mutate()}
        onCancel={() => {
          setConfirm(false);
          withdraw.reset();
        }}
      >
        <div className="stack">
          <p>
            «{application.company.displayName}» увидит, что отклик отозван, и потеряет доступ к контактам, открытым этим
            откликом.
          </p>
          {withdraw.error && (
            <Callout tone={isApiError(withdraw.error, 409) ? 'warning' : 'danger'} role="alert">
              {isApiError(withdraw.error, 409)
                ? 'Компания уже приняла решение — статус обновлён.'
                : describeError(withdraw.error).message}
            </Callout>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
