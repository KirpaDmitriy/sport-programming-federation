import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Need, needsKey, publishNeed, unpublishNeed } from '@/entities/need';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { Button, ButtonLink, Callout, ConfirmDialog } from '@/shared/ui';

/** Publishing turns a need into a vacancy candidates can browse; invitations work either way. */
export function PublishControl({ need }: { need: Need }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const toggle = useMutation({
    mutationFn: () => (need.published ? unpublishNeed(need.id) : publishNeed(need.id)),
    onSuccess: (updated) => {
      setConfirm(false);
      queryClient.setQueryData([...needsKey(scope), need.id], updated);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: needsKey(scope) }),
  });
  const close = () => {
    setConfirm(false);
    toggle.reset();
  };
  return (
    <>
      <Button icon={need.published ? 'minusCircle' : 'upload'} onClick={() => setConfirm(true)}>
        {need.published ? 'Снять с публикации' : 'Опубликовать вакансию'}
      </Button>
      <ConfirmDialog
        open={confirm}
        title={need.published ? 'Снять вакансию с публикации?' : 'Опубликовать вакансию?'}
        confirmLabel={need.published ? 'Снять с публикации' : 'Опубликовать'}
        danger={need.published}
        pending={toggle.isPending}
        onConfirm={() => toggle.mutate()}
        onCancel={close}
      >
        <div className="stack">
          {need.published ? (
            <p>
              «{need.title}» исчезнет из списка вакансий. Полученные отклики останутся с условиями, на которые
              откликнулись кандидаты.
            </p>
          ) : (
            <p>
              Кандидаты увидят «{need.title}»: зарплатную вилку, описание, требования и профиль компании. Отклик сразу
              откроет вам выбранные кандидатом контакты.
            </p>
          )}
          {toggle.error && (
            <Callout tone="danger" role="alert">
              {describeError(toggle.error).message}
              {isApiError(toggle.error, 422) && (
                <div style={{ marginTop: '0.5rem' }}>
                  <ButtonLink to="/employer/company" size="sm">
                    Заполнить профиль компании
                  </ButtonLink>
                </div>
              )}
            </Callout>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
