import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Assessment,
  type AssessmentAnswer,
  askAssistant,
  assessmentKey,
  assessmentQuery,
  assessmentsKey,
  CheckStatusChip,
  isEditable,
  isEvaluating,
  runChecks,
  saveAnswer,
  submitAssessment,
} from '@/entities/assessment';
import { useJob } from '@/entities/job';
import { profileKey } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { graphKey, skillsKey } from '@/entities/skill';
import { describeError, isApiError, newIdempotencyKey } from '@/shared/api';
import { formatTime, gradeLabel, specializationLabel, useDocumentTitle } from '@/shared/lib';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  ConfirmDialog,
  Icon,
  InlineStatus,
  panelId,
  Segmented,
  StatusChip,
  type TabItem,
  Tabs,
  TextareaField,
  UnsavedChangesGuard,
} from '@/shared/ui';
import styles from './workspace-page.module.css';

type Step = 'task' | 'solution' | 'explanation';
type SaveState = { status: 'saved' | 'dirty' | 'saving' | 'error'; at: Date | null; error?: unknown };
type ChatMessage = { id: number; from: 'user' | 'assistant'; text: string; simulation: boolean };

const AUTOSAVE_DELAY = 1200;
const stepLabels: Record<Step, string> = { task: 'Условие', solution: 'Решение', explanation: 'Объяснение' };
const stepOrder: Step[] = ['task', 'solution', 'explanation'];

function CodeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const gutter = useRef<HTMLPreElement>(null);
  const lines = value.split('\n').length;
  return (
    <div className={styles.editor}>
      <pre className={styles.gutter} ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => index + 1).join('\n')}
      </pre>
      <textarea
        className={styles.code}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Код решения на Rust"
        aria-describedby="editor-hint"
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
        }}
      />
    </div>
  );
}

function TaskPanel({ assessment }: { assessment: Assessment }) {
  const [tab, setTab] = useState<'task' | 'materials'>('task');
  const task = assessment.task;
  const tabs: TabItem<'task' | 'materials'>[] = [
    { id: 'task', label: 'Условие' },
    { id: 'materials', label: 'Рубрика' },
  ];
  return (
    <Card className={styles.pane}>
      <Tabs items={tabs} value={tab} onChange={setTab} label="Материалы задачи" idPrefix="task" />
      <div
        role="tabpanel"
        id={panelId('task', tab)}
        aria-labelledby={`task-tab-${tab}`}
        className="stack"
        style={{ paddingTop: '1rem' }}
      >
        {tab === 'task' ? (
          <>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{task.title}</h2>
            <p>{task.prompt}</p>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Требования</h3>
            <ol className={styles.criteria}>
              {task.acceptanceCriteria.map((criterion) => (
                <li key={criterion}>
                  <span>{criterion}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="small muted">
              Семейство задач «{task.family}», версия {task.version}, вариант {task.variantId}. Рубрика общая для всех
              вариантов семейства.
            </p>
            <ul className="stack" style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {task.rubric.map((criterion) => (
                <li key={criterion.id}>
                  {criterion.label} <span className="small muted">· вес {criterion.weight}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function AssistantPanel({ assessment, disabled }: { assessment: Assessment; disabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);
  const ask = useMutation({
    mutationFn: (message: string) => askAssistant(assessment.id, message),
    onSuccess: (reply) =>
      setMessages((items) => [
        ...items,
        { id: nextId.current++, from: 'assistant', text: reply.message, simulation: reply.simulation },
      ]),
  });
  return (
    <Card className={styles.pane} title="ИИ-помощник" headingLevel={2}>
      <div className="stack">
        <p className="small muted">
          Помощник разрешён на всех этапах, как и внешние инструменты.
          {assessment.simulation && ' В демо-стенде ответы подготовлены заранее, модель не вызывается.'}
        </p>
        {messages.length > 0 && (
          <ol className={styles.chat} aria-live="polite" aria-label="Переписка с помощником">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`${styles.message} ${message.from === 'user' ? styles.fromUser : styles.fromAssistant}`}
              >
                <span className="visually-hidden">{message.from === 'user' ? 'Вы: ' : 'Помощник: '}</span>
                {message.text}
                {message.from === 'assistant' && message.simulation && (
                  <div className="small muted" style={{ marginTop: '0.5rem' }}>
                    Демонстрационный ответ
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {ask.error && (
          <Callout tone="warning">
            Помощник недоступен: {describeError(ask.error).message}. Работа с решением не затронута.
          </Callout>
        )}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setMessages((items) => [...items, { id: nextId.current++, from: 'user', text, simulation: false }]);
            setDraft('');
            ask.mutate(text);
          }}
        >
          <TextareaField
            id="assistant-question"
            label="Вопрос о решении"
            rows={3}
            maxLength={10000}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            icon="send"
            disabled={disabled || !draft.trim()}
            pending={ask.isPending}
            pendingLabel="Ждём ответ…"
          >
            Спросить
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Workspace({ assessment }: { assessment: Assessment }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('solution');
  const [answer, setAnswer] = useState<AssessmentAnswer>(assessment.answer);
  const [save, setSave] = useState<SaveState>({ status: 'saved', at: null });
  const [checksJobId, setChecksJobId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const lastSaved = useRef(JSON.stringify(assessment.answer));
  const submitKey = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const latest = useRef(answer);
  latest.current = answer;
  const persist = useMutation({ mutationFn: (value: AssessmentAnswer) => saveAnswer(assessment.id, value) });

  const flush = useCallback(
    async (value: AssessmentAnswer) => {
      const serialized = JSON.stringify(value);
      if (serialized === lastSaved.current) return true;
      setSave((current) => ({ ...current, status: 'saving' }));
      try {
        const updated = await persist.mutateAsync(value);
        lastSaved.current = serialized;
        queryClient.setQueryData(assessmentKey(scope, assessment.id), updated);
        setSave({ status: serialized === JSON.stringify(latest.current) ? 'saved' : 'dirty', at: new Date() });
        return true;
      } catch (error) {
        setSave((current) => ({ status: 'error', at: current.at, error }));
        if (isApiError(error, 409))
          void queryClient.invalidateQueries({ queryKey: assessmentKey(scope, assessment.id) });
        return false;
      }
    },
    [assessment.id, persist, queryClient, scope],
  );

  useEffect(() => {
    if (JSON.stringify(answer) === lastSaved.current) return;
    setSave((current) => (current.status === 'saving' ? current : { ...current, status: 'dirty' }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(latest.current), AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer.current);
  }, [answer, flush]);

  const checksJob = useJob(scope, checksJobId, () => {
    void queryClient.invalidateQueries({ queryKey: assessmentKey(scope, assessment.id) });
  });
  const checksRunning =
    Boolean(checksJobId) && checksJob.data?.status !== 'succeeded' && checksJob.data?.status !== 'failed';

  const startChecks = useMutation({
    mutationFn: async () => {
      if (!(await flush(latest.current))) throw new Error('Черновик не сохранён');
      return runChecks(assessment.id);
    },
    onSuccess: (job) => setChecksJobId(job.id),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!(await flush(latest.current))) throw new Error('Черновик не сохранён — отправка отменена');
      submitKey.current ??= newIdempotencyKey();
      return submitAssessment(assessment.id, submitKey.current);
    },
    onSuccess: async () => {
      setConfirmSubmit(false);
      await Promise.all(
        [
          assessmentKey(scope, assessment.id),
          assessmentsKey(scope),
          profileKey(scope),
          skillsKey(scope),
          graphKey(scope),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      await navigate({ to: '/candidate/assessments/$assessmentId/result', params: { assessmentId: assessment.id } });
    },
    onError: (error) => {
      // A server answer closes this logical submission; only transport failures keep the key for a retry.
      if (isApiError(error)) submitKey.current = null;
    },
  });

  const requestSubmit = () => {
    if (!answer.code.trim()) {
      setStep('solution');
      return;
    }
    if (!answer.explanation.trim()) {
      setStep('explanation');
      setExplanationError('Опишите решение перед отправкой: объяснение входит в оценку.');
      return;
    }
    setConfirmSubmit(true);
  };

  const checks = assessment.checks;
  const passed = checks.filter((check) => check.status === 'passed').length;
  const stepIndex = stepOrder.indexOf(step) + 1;

  return (
    <>
      <UnsavedChangesGuard when={save.status !== 'saved' && !submit.isSuccess}>
        <p>Последние изменения ещё не сохранены на сервере. Если уйти сейчас, они будут потеряны.</p>
      </UnsavedChangesGuard>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {specializationLabel[assessment.specialization]} · Проверка {gradeLabel[assessment.grade]}
          </h1>
          <div className={styles.steps}>
            <span className="muted">
              Шаг {stepIndex} из 3 · {stepLabels[step]}
            </span>
            <Segmented<Step>
              label="Этап работы"
              value={step}
              onChange={setStep}
              options={stepOrder.map((value, index) => ({ value, label: `${index + 1}. ${stepLabels[value]}` }))}
            />
          </div>
        </div>
        <div className={styles.badges}>
          <StatusChip tone="success" icon="sparkles">
            ИИ разрешён, включая внешние инструменты
          </StatusChip>
          <StatusChip tone="info" icon="info">
            Неудачная попытка не снизит подтверждённый грейд
          </StatusChip>
        </div>
      </div>
      {assessment.task.execution === 'simulated' && (
        <Callout tone="warning" title="Демонстрационная проверка">
          Код не компилируется и не исполняется. Результаты проверок и итоговая оценка берутся из сценария стенда.
        </Callout>
      )}
      <div className={styles.panes} style={{ marginTop: '1rem' }}>
        <TaskPanel assessment={assessment} />
        <div className={`${styles.pane} stack`}>
          {step === 'task' && (
            <Card title="Перед началом">
              <div className="stack">
                <p>
                  Прочитайте условие и рубрику. Решение и объяснение сохраняются как черновик автоматически, отправка
                  выполняется один раз.
                </p>
                <Button variant="primary" iconAfter="arrowRight" onClick={() => setStep('solution')}>
                  Перейти к решению
                </Button>
              </div>
            </Card>
          )}
          {step === 'solution' && (
            <>
              <Card>
                <div className={styles.editorHead}>
                  <strong>Решение</strong>
                  <StatusChip tone="neutral" icon="code">
                    Язык: Rust
                  </StatusChip>
                </div>
                <CodeEditor value={answer.code} onChange={(code) => setAnswer((value) => ({ ...value, code }))} />
                <p id="editor-hint" className="small muted" style={{ marginTop: '0.5rem' }}>
                  Tab переводит фокус к следующему элементу; для отступов используйте пробелы.
                </p>
              </Card>
              <Card
                title={`Проверки · ${passed} из ${checks.length} пройдены`}
                subtitle={assessment.simulation ? 'Симуляция: результаты заданы сценарием стенда' : undefined}
              >
                {checksRunning && <InlineStatus>Проверки выполняются…</InlineStatus>}
                {checksJob.data?.status === 'failed' && (
                  <Callout tone="warning" title="Проверки не завершены">
                    {checksJob.data.error?.message ?? 'Сервис проверок недоступен.'} Это техническая ошибка, а не оценка
                    решения.
                  </Callout>
                )}
                {startChecks.error && <Callout tone="danger">{describeError(startChecks.error).message}</Callout>}
                <ul className={styles.checks}>
                  {checks.map((check) => (
                    <li key={check.id} className={styles.check}>
                      <span className="stack" style={{ gap: '0.125rem' }}>
                        <strong>{check.label}</strong>
                        <span className="small muted">{check.message}</span>
                      </span>
                      <CheckStatusChip status={check.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
          {step === 'explanation' && (
            <Card title="Объяснение решения">
              <div className="stack">
                <p className="small muted">
                  Опишите границы транзакции, поведение при одновременных запросах и повтор после ошибки. Требования к
                  адаптации, если они есть, указаны в условии задачи.
                </p>
                <TextareaField
                  id="assessment-explanation"
                  label="Объяснение"
                  rows={10}
                  maxLength={20000}
                  value={answer.explanation}
                  error={explanationError ?? undefined}
                  onChange={(event) => {
                    setExplanationError(null);
                    setAnswer((value) => ({ ...value, explanation: event.target.value }));
                  }}
                />
                <Checkbox
                  checked={answer.externalAiUsed}
                  onChange={(event) => setAnswer((value) => ({ ...value, externalAiUsed: event.target.checked }))}
                  label="Я использовал внешние ИИ-инструменты"
                  description="Это разрешено и не снижает оценку; отметка помогает интерпретировать результат."
                />
              </div>
            </Card>
          )}
        </div>
        <AssistantPanel assessment={assessment} disabled={submit.isPending} />
      </div>
      <div className={styles.footer}>
        <span className="row small" role="status">
          <Icon
            name={save.status === 'error' ? 'alert' : save.status === 'saved' ? 'checkCircle' : 'clock'}
            size={18}
          />
          {save.status === 'saved' &&
            (save.at ? `Черновик сохранён в ${formatTime(save.at)}` : 'Черновик соответствует сохранённой версии')}
          {save.status === 'dirty' && 'Есть несохранённые изменения'}
          {save.status === 'saving' && 'Сохраняем черновик…'}
          {save.status === 'error' && (
            <span className={styles.saveError}>
              Черновик не сохранён: {describeError(save.error).message}{' '}
              <Button size="sm" variant="quiet" onClick={() => void flush(latest.current)}>
                Повторить
              </Button>
            </span>
          )}
        </span>
        <div className={styles.footerActions}>
          <Button
            icon="play"
            onClick={() => startChecks.mutate()}
            pending={startChecks.isPending || checksRunning}
            pendingLabel="Проверяем…"
            disabled={submit.isPending}
          >
            Запустить проверки
          </Button>
          <Button variant="primary" icon="send" onClick={requestSubmit} disabled={submit.isPending}>
            Отправить решение
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmSubmit}
        title="Отправить решение на оценку?"
        confirmLabel="Отправить"
        pending={submit.isPending}
        onConfirm={() => submit.mutate()}
        onCancel={() => {
          setConfirmSubmit(false);
          submit.reset();
        }}
      >
        <div className="stack">
          <p>
            После отправки решение и объяснение изменить нельзя. Подтверждённый грейд сохранится при любом результате.
          </p>
          {submit.error && (
            <Callout tone="danger" role="alert">
              {describeError(submit.error).message}
            </Callout>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}

export function AssessmentWorkspacePage({ assessmentId }: { assessmentId: string }) {
  useDocumentTitle('Практическая проверка');
  const scope = useScope();
  const { data: assessment } = useSuspenseQuery(assessmentQuery(scope, assessmentId));
  if (!isEditable(assessment)) {
    return (
      <Card title={isEvaluating(assessment) ? 'Решение отправлено' : 'Проверка завершена'}>
        <div className="stack">
          <p>Эта попытка уже отправлена, редактировать решение нельзя.</p>
          <ButtonLink
            to="/candidate/assessments/$assessmentId/result"
            params={{ assessmentId }}
            variant="primary"
            iconAfter="arrowRight"
          >
            Открыть результат
          </ButtonLink>
        </div>
      </Card>
    );
  }
  return <Workspace key={assessment.id} assessment={assessment} />;
}
