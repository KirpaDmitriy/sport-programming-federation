import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useScope } from '@/entities/session';
import { connectSource, type Source, sourcesKey } from '@/entities/source';
import { describeError } from '@/shared/api';
import { Button, Callout, TextField } from '@/shared/ui';

type Props = {
  provider: Source['provider'];
  label: string;
  submitLabel: string;
  hint?: string;
  placeholder?: string;
  onConnected?: () => void;
};

export function ConnectSourceForm({ provider, label, submitLabel, hint, placeholder, onConnected }: Props) {
  const id = useId();
  const scope = useScope();
  const queryClient = useQueryClient();
  const connect = useMutation({
    mutationFn: (account: string) => connectSource(provider, account),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sourcesKey(scope) });
      onConnected?.();
    },
  });
  const form = useForm({
    defaultValues: { account: '' },
    onSubmit: ({ value }) => connect.mutateAsync(value.account.trim()).catch(() => {}),
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="account"
        validators={{ onSubmit: ({ value }) => (value.trim() ? undefined : 'Укажите идентификатор аккаунта') }}
      >
        {(field) => (
          <TextField
            id={`${id}-account`}
            label={label}
            maxLength={100}
            placeholder={placeholder}
            hint={hint}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            error={field.state.meta.errors[0] as string | undefined}
          />
        )}
      </form.Field>
      {connect.error && (
        <Callout tone="danger" role="alert">
          {describeError(connect.error).message}
        </Callout>
      )}
      <Button type="submit" variant="primary" pending={connect.isPending} pendingLabel="Подключаем…">
        {submitLabel}
      </Button>
    </form>
  );
}
