import { useBlocker } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ConfirmDialog } from './overlay';

type Props = { when: boolean; children?: ReactNode };

/** Asks before leaving a route (or closing the tab) while edits have not been confirmed by the server. */
export function UnsavedChangesGuard({ when, children }: Props) {
  const blocker = useBlocker({ shouldBlockFn: () => when, enableBeforeUnload: () => when, withResolver: true });
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title="Уйти без сохранения?"
      confirmLabel="Уйти без сохранения"
      cancelLabel="Остаться"
      danger
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      {children ?? <p>Изменения на этой странице ещё не сохранены и будут потеряны.</p>}
    </ConfirmDialog>
  );
}
