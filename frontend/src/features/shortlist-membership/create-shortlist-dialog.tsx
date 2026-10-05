import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useScope } from '@/entities/session';
import { createShortlist, type Shortlist, shortlistKey, shortlistsKey } from '@/entities/shortlist';
import { describeError } from '@/shared/api';
import { Button, Callout, Dialog, TextField } from '@/shared/ui';

type Props = { open: boolean; onClose: () => void; onCreated: (shortlist: Shortlist) => void };

export function CreateShortlistDialog({ open, onClose, onCreated }: Props) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: () => createShortlist(title.trim()),
    onSuccess: async (shortlist) => {
      queryClient.setQueryData(shortlistKey(scope, shortlist.id), shortlist);
      await queryClient.invalidateQueries({ queryKey: shortlistsKey(scope), exact: true });
      setTitle('');
      setTouched(false);
      onCreated(shortlist);
    },
  });
  const error = touched && !title.trim() ? 'Укажите название подборки' : undefined;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Новая подборка"
      description="Подборка хранится на сервере и не зависит от фильтров поиска."
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            pending={create.isPending}
            onClick={() => {
              setTouched(true);
              if (title.trim()) create.mutate();
            }}
          >
            Создать
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (title.trim()) create.mutate();
        }}
      >
        <TextField
          id="shortlist-title"
          label="Название"
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={error}
        />
      </form>
      {create.error && <Callout tone="danger">{describeError(create.error).message}</Callout>}
    </Dialog>
  );
}
