import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  answerInterview,
  type Interview,
  type InterviewNode,
  interviewsKey,
  interviewsQuery,
  startInterview,
} from '@/entities/interview';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { Button, Callout, Card, cx, ErrorState, LoadingState, StatusChip, TextareaField } from '@/shared/ui';
import styles from './graph-interview.module.css';

const stateLabel: Record<InterviewNode['state'], string> = {
  unknown: 'Ещё не проверено',
  observed: 'Есть сигнал',
  partial: 'Частично подтверждено',
  confirmed: 'Подтверждено',
  contradicted: 'Нужно разобрать ошибку',
};

const stateTone: Record<InterviewNode['state'], 'neutral' | 'warning' | 'success' | 'danger'> = {
  unknown: 'neutral',
  observed: 'neutral',
  partial: 'warning',
  confirmed: 'success',
  contradicted: 'danger',
};

function GraphNode({ node, current }: { node: InterviewNode; current: boolean }) {
  return (
    <div className={cx(styles.node, current && styles.current)}>
      <strong>{node.label}</strong>
      <span className={styles.nodeMeta}>{node.kind === 'behavioral' ? 'Коммуникация' : 'Технический навык'}</span>
      <StatusChip tone={stateTone[node.state]}>{stateLabel[node.state]}</StatusChip>
    </div>
  );
}

function Branch({
  id,
  nodes,
  currentId,
  path,
}: {
  id: string;
  nodes: InterviewNode[];
  currentId: string | undefined;
  path: Set<string>;
}) {
  const node = nodes.find((item) => item.id === id);
  if (!node || path.has(id)) return null;
  const nextPath = new Set(path).add(id);
  return (
    <li>
      <GraphNode node={node} current={node.id === currentId} />
      {node.prerequisites.length > 0 && (
        <ul>
          {node.prerequisites.map((prerequisite) => (
            <Branch key={prerequisite} id={prerequisite} nodes={nodes} currentId={currentId} path={nextPath} />
          ))}
        </ul>
      )}
    </li>
  );
}

function InterviewGraph({ interview }: { interview: Interview }) {
  const prerequisites = new Set(interview.nodes.flatMap((node) => node.prerequisites));
  const roots = interview.nodes.filter((node) => !prerequisites.has(node.id));
  return (
    <div className={styles.graphWrap}>
      <div className={styles.legend}>Связи показывают, что нужно подтвердить перед составным навыком.</div>
      <ul className={styles.tree} aria-label="Граф компетенций интервью">
        {roots.map((node) => (
          <Branch
            key={node.id}
            id={node.id}
            nodes={interview.nodes}
            currentId={interview.currentQuestion?.nodeId}
            path={new Set()}
          />
        ))}
      </ul>
    </div>
  );
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  window.speechSynthesis.speak(utterance);
}

function ActiveInterview({ interview }: { interview: Interview }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const question = interview.currentQuestion;
      if (!question) throw new Error('Интервью уже завершено');
      return answerInterview(interview.id, {
        questionId: question.id,
        answer: answer.trim(),
        revision: interview.revision,
      });
    },
    onSuccess: (updated) => {
      setAnswer('');
      queryClient.setQueryData(interviewsKey(scope), (current: { items: Interview[] } | undefined) => ({
        items: [updated, ...(current?.items.filter((item) => item.id !== updated.id) ?? [])],
      }));
    },
    onError: (error) => {
      if (isApiError(error, 409)) void queryClient.invalidateQueries({ queryKey: interviewsKey(scope) });
    },
  });
  const question = interview.currentQuestion;
  return (
    <div className={styles.workspace}>
      <InterviewGraph interview={interview} />
      <Card className={styles.dialogue} title={interview.status === 'active' ? 'Собеседование' : 'Результат'}>
        <div className="stack">
          <div className={cx(styles.avatar, question && styles.speaking)} aria-hidden="true">
            <span />
          </div>
          {question ? (
            <>
              <div>
                <span className="small muted">Вопрос {question.sequence}</span>
                <p className={styles.question}>{question.prompt}</p>
              </div>
              <Button size="sm" icon="play" onClick={() => speak(question.delivery.speechText)}>
                Озвучить вопрос
              </Button>
              <TextareaField
                id="interview-answer"
                label="Ваш ответ"
                hint="Опишите ход решения и проговорите компромиссы. Ответ оценивается только по его содержанию."
                rows={7}
                maxLength={8000}
                value={answer}
                disabled={mutation.isPending}
                onChange={(event) => setAnswer(event.target.value)}
              />
              {mutation.error && <Callout tone="warning">{describeError(mutation.error).message}</Callout>}
              <Button
                variant="primary"
                icon="send"
                pending={mutation.isPending}
                pendingLabel="Разбираем ответ…"
                disabled={!answer.trim()}
                onClick={() => mutation.mutate()}
              >
                Ответить
              </Button>
            </>
          ) : (
            <Callout tone="success">Интервью завершено. Граф показывает подтверждённые навыки и пробелы.</Callout>
          )}
          {interview.evidence.length > 0 && (
            <details>
              <summary>Разбор ответов ({interview.evidence.length})</summary>
              <ol className={styles.evidence}>
                {interview.evidence.map((entry) => (
                  <li key={entry.questionId}>
                    <strong>{interview.nodes.find((node) => node.id === entry.nodeId)?.label ?? entry.nodeId}</strong>
                    <p>{entry.rationale}</p>
                    <blockquote>{entry.answerExcerpt}</blockquote>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </Card>
    </div>
  );
}

export function GraphInterview({ available }: { available: boolean }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const interviews = useQuery({ ...interviewsQuery(scope), enabled: available });
  const start = useMutation({
    mutationFn: startInterview,
    onSuccess: (interview) => {
      queryClient.setQueryData(interviewsKey(scope), (current: { items: Interview[] } | undefined) => ({
        items: [interview, ...(current?.items.filter((item) => item.id !== interview.id) ?? [])],
      }));
    },
  });
  const current = useMemo(
    () => interviews.data?.items.find((item) => item.status === 'active') ?? interviews.data?.items[0],
    [interviews.data],
  );
  const canStart = !current || current.status === 'completed';
  if (!available) return null;
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <h2>Собеседование по графу навыков</h2>
          <p className="muted">Вопросы идут по зависимостям: если составной навык не раскрыт, проверяем его основу.</p>
        </div>
        {canStart && (
          <Button
            variant="primary"
            icon="sparkles"
            pending={start.isPending}
            pendingLabel="Начинаем…"
            onClick={() => start.mutate()}
          >
            {current ? 'Начать новое собеседование' : 'Начать собеседование'}
          </Button>
        )}
      </div>
      {interviews.isPending && <LoadingState />}
      {interviews.isError && <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} />}
      {start.error && <Callout tone="warning">{describeError(start.error).message}</Callout>}
      {current && <ActiveInterview interview={current} />}
      {interviews.data && !current && (
        <Callout tone="neutral">
          Интервью рассчитано на backend-разработчика уровня мидл и занимает до 10 вопросов.
        </Callout>
      )}
    </section>
  );
}
