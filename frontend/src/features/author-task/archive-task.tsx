import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useScope } from '@/entities/session';
import { archiveTask, type Task, tasksKey } from '@/entities/task';
import { describeError } from '@/shared/api';
import { Button, Callout, ConfirmDialog } from '@/shared/ui';

export function ArchiveTask({ task }: { task: Task }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const archive = useMutation({
    mutationFn: () => archiveTask(task.id),
    onSuccess: () => setConfirm(false),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksKey(scope) }),
  });
  if (task.status === 'archived') return null;
  return (
    <>
      <Button size="sm" variant="quiet" icon="minusCircle" onClick={() => setConfirm(true)}>
        В архив
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Убрать задание в архив?"
        confirmLabel="В архив"
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
        onCancel={() => {
          setConfirm(false);
          archive.reset();
        }}
      >
        <div className="stack">
          <p>«{task.title}» больше не будут предлагать кандидатам. Полученные ответы останутся.</p>
          {archive.error && <Callout tone="danger">{describeError(archive.error).message}</Callout>}
        </div>
      </ConfirmDialog>
    </>
  );
}
