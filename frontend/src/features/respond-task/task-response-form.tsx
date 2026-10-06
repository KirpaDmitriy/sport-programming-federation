import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { profileKey } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { type OfferedTask, respondToTask, type TaskResponse, taskModeLabel, tasksKey } from '@/entities/task';
import { describeError, isApiError, newIdempotencyKey } from '@/shared/api';
import { Button, Callout, Segmented, TextareaField, useToast } from '@/shared/ui';

const ANSWER_LIMIT = 10000;

/** One answer per weekly task; the server counts it toward profile freshness unless the company rejects it. */
export function TaskResponseForm({ task }: { task: OfferedTask }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<TaskResponse['mode']>('approach');
  const [answer, setAnswer] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const send = useMutation({
    mutationFn: () => {
      const input = { mode, answer: answer.trim() };
      const fingerprint = JSON.stringify(input);
      // The same answer keeps its key across transport retries; an edited one is a new command.
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newIdempotencyKey() };
      return respondToTask(task.id, input, pending.current.key);
    },
    onSuccess: async () => {
      pending.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tasksKey(scope) }),
        queryClient.invalidateQueries({ queryKey: profileKey(scope) }),
      ]);
      toast(`Ответ отправлен в «${task.company.displayName}»`);
    },
    onError: (error) => {
      if (isApiError(error)) pending.current = null;
      if (isApiError(error, 409)) void queryClient.invalidateQueries({ queryKey: tasksKey(scope) });
    },
  });
  const answerError = touched && !answer.trim() ? 'Напишите решение или подход' : undefined;
  const submit = () => {
    setTouched(true);
    if (answer.trim()) send.mutate();
  };
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Segmented<TaskResponse['mode']>
        label="Формат ответа"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'approach', label: taskModeLabel.approach },
          { value: 'solution', label: taskModeLabel.solution },
        ]}
      />
      <TextareaField
        id="task-answer"
        label={mode === 'solution' ? 'Ваше решение' : 'Ваш подход'}
        required
        rows={8}
        maxLength={ANSWER_LIMIT}
        value={answer}
        error={answerError}
        hint={
          mode === 'solution'
            ? 'Код или пошаговое решение. Код здесь не исполняется.'
            : 'Как бы вы решали задачу: шаги, решения и их причины.'
        }
        onChange={(event) => setAnswer(event.target.value)}
      />
      {send.error && (
        <Callout tone={isApiError(send.error, 409) ? 'warning' : 'danger'} role="alert">
          {isApiError(send.error, 409)
            ? `${describeError(send.error).message}. Показано актуальное задание.`
            : `Ответ не отправлен: ${describeError(send.error).message} Текст остался в поле.`}
        </Callout>
      )}
      <Button type="submit" variant="primary" pending={send.isPending} pendingLabel="Отправляем ответ…">
        Отправить ответ
      </Button>
      <p className="small muted">Ответ увидит только компания — автор задания. Отправить его можно один раз.</p>
    </form>
  );
}
