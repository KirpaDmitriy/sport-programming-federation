import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useScope } from '@/entities/session';
import { reviewTaskResponse, type TaskResponse, tasksKey } from '@/entities/task';
import { describeError, isApiError } from '@/shared/api';
import { Button, Callout, TextareaField } from '@/shared/ui';

/** The authoring company's verdict; «Нужно доработать» stops the answer from counting toward freshness. */
export function TaskReviewForm({ response }: { response: TaskResponse }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const review = useMutation({
    mutationFn: (outcome: 'accepted' | 'needs_work') => reviewTaskResponse(response.id, { outcome, feedback }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksKey(scope) }),
  });
  return (
    <div className="stack">
      <TextareaField
        id={`feedback-${response.id}`}
        label="Комментарий кандидату"
        rows={3}
        maxLength={2000}
        value={feedback}
        hint="Необязательно. Кандидат увидит его вместе с оценкой."
        onChange={(event) => setFeedback(event.target.value)}
      />
      {review.error && (
        <Callout tone={isApiError(review.error, 409) ? 'warning' : 'danger'} role="alert">
          {isApiError(review.error, 409)
            ? 'Ответ уже оценён — показано актуальное состояние.'
            : describeError(review.error).message}
        </Callout>
      )}
      <div className="row">
        <Button
          variant="primary"
          size="sm"
          pending={review.isPending && review.variables === 'accepted'}
          disabled={review.isPending}
          onClick={() => review.mutate('accepted')}
        >
          Засчитать
        </Button>
        <Button
          size="sm"
          pending={review.isPending && review.variables === 'needs_work'}
          disabled={review.isPending}
          onClick={() => review.mutate('needs_work')}
        >
          Нужно доработать
        </Button>
      </div>
    </div>
  );
}
