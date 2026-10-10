import { type Edge, Handle, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  answerInterview,
  type Interview,
  type InterviewNode,
  interviewKey,
  interviewsKey,
  interviewsQuery,
  startInterview,
} from '@/entities/interview';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { Button, Callout, Card, cx, ErrorState, Icon, LoadingState, StatusChip, TextareaField } from '@/shared/ui';
import styles from './graph-interview.module.css';

const stateLabel: Record<InterviewNode['state'], string> = {
  unknown: 'Не проверено',
  observed: 'Есть сигнал',
  partial: 'Частично',
  confirmed: 'Подтверждено',
  contradicted: 'Есть ошибка',
};

const stateTone: Record<InterviewNode['state'], 'neutral' | 'warning' | 'success' | 'danger'> = {
  unknown: 'neutral',
  observed: 'neutral',
  partial: 'warning',
  confirmed: 'success',
  contradicted: 'danger',
};

type GraphNodeData = { node: InterviewNode; current: boolean };
type FlowNode = Node<GraphNodeData, 'interview'>;

function InterviewNodeCard({ data }: NodeProps<FlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <div className={cx(styles.node, data.current && styles.current, styles[data.node.kind])}>
        <span className={styles.nodeKind}>{data.node.kind === 'behavioral' ? 'Soft skill' : 'Технический навык'}</span>
        <strong>{data.node.label}</strong>
        <StatusChip tone={stateTone[data.node.state]}>{stateLabel[data.node.state]}</StatusChip>
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </>
  );
}

const nodeTypes = { interview: InterviewNodeCard };

function graphLayout(nodes: InterviewNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  const depthOf = (id: string, path = new Set<string>()): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0;
    const node = byId.get(id);
    const nextPath = new Set(path).add(id);
    const depth = !node?.prerequisites.length
      ? 0
      : Math.max(...node.prerequisites.map((prerequisite) => depthOf(prerequisite, nextPath))) + 1;
    depths.set(id, depth);
    return depth;
  };
  for (const node of nodes) depthOf(node.id);
  const rows = new Map<number, InterviewNode[]>();
  for (const node of nodes) rows.set(depthOf(node.id), [...(rows.get(depthOf(node.id)) ?? []), node]);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, row] of rows) {
    row.forEach((node, index) => {
      positions.set(node.id, { x: index * 220, y: depth * 170 });
    });
  }
  return positions;
}

export function InterviewGraph({ interview }: { interview: Interview }) {
  const { nodes, edges } = useMemo(() => {
    const positions = graphLayout(interview.nodes);
    const flowNodes: FlowNode[] = interview.nodes.map((node) => ({
      id: node.id,
      type: 'interview',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: { node, current: node.id === interview.currentQuestion?.nodeId },
      draggable: false,
      selectable: false,
      connectable: false,
    }));
    const flowEdges: Edge[] = interview.nodes.flatMap((node) =>
      node.prerequisites.map((prerequisite) => ({
        id: `${prerequisite}->${node.id}`,
        source: prerequisite,
        target: node.id,
        type: 'smoothstep',
        animated: node.id === interview.currentQuestion?.nodeId,
        markerEnd: { type: 'arrowclosed' as const },
        style: {
          stroke: node.kind === 'behavioral' ? 'var(--fsp-color-accent)' : 'var(--fsp-color-primary)',
          strokeWidth: 2,
        },
      })),
    );
    return { nodes: flowNodes, edges: flowEdges };
  }, [interview]);
  return (
    <div className={styles.graphColumn}>
      <section className={styles.graphWrap} aria-label="Граф компетенций интервью">
        <div className={styles.graphLegend}>
          <span>
            <i className={styles.techDot} /> Техническая ветка
          </span>
          <span>
            <i className={styles.softDot} /> Взаимодействие с людьми
          </span>
          <span>Стрелка: навык нужен для следующего узла</span>
        </div>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.35}
            maxZoom={1.15}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: false }}
          />
        </ReactFlowProvider>
      </section>
      <details className={styles.graphList}>
        <summary>Граф списком</summary>
        <ul>
          {interview.nodes.map((node) => (
            <li key={node.id}>
              <strong>{node.label}</strong>
              <span>
                {node.prerequisites.length > 0
                  ? `После: ${node.prerequisites.map((id) => interview.nodes.find((item) => item.id === id)?.label ?? id).join(', ')}`
                  : 'Начальный узел'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function Avatar({ state }: { state: 'idle' | 'speaking' | 'listening' | 'thinking' }) {
  return (
    <div className={cx(styles.avatarStage, styles[state])} role="img" aria-label={`Интервьюер: ${state}`}>
      <div className={styles.avatarHalo} />
      <div className={styles.avatarBody}>
        <div className={styles.avatarHead}>
          <span className={styles.eyeLeft} />
          <span className={styles.eyeRight} />
          <span className={styles.mouth} />
        </div>
        <div className={styles.avatarTorso} />
      </div>
      <span className={styles.avatarState}>
        {state === 'speaking' && 'Задаёт вопрос'}
        {state === 'listening' && 'Слушает вас'}
        {state === 'thinking' && 'Разбирает ответ'}
        {state === 'idle' && 'Готов слушать'}
      </span>
    </div>
  );
}

export function InterviewWorkspace({ interview }: { interview: Interview }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const recognition = useRef<Recognition | null>(null);
  const [answer, setAnswer] = useState('');
  const [interim, setInterim] = useState('');
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(() => (recognitionConstructor() ? 'voice' : 'text'));
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const question = interview.currentQuestion;
  const speechText = question?.delivery.speechText;

  const sayQuestion = useCallback(() => {
    if (!speechText || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'ru-RU';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [speechText]);

  useEffect(() => {
    setAnswer('');
    setInterim('');
    const timer = window.setTimeout(sayQuestion, 250);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
    };
  }, [sayQuestion]);

  useEffect(() => () => recognition.current?.abort(), []);

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setInputMode('text');
      setSpeechError('В этом браузере нет распознавания речи. Продолжите текстом.');
      return;
    }
    window.speechSynthesis?.cancel();
    const instance = new Constructor();
    instance.lang = 'ru-RU';
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }
      if (finalText) setAnswer((current) => `${current}${current ? ' ' : ''}${finalText.trim()}`);
      setInterim(interimText);
    };
    instance.onerror = () => {
      setListening(false);
      setSpeechError('Не удалось распознать речь. Можно повторить или перейти к тексту.');
    };
    instance.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognition.current = instance;
    setSpeechError(null);
    setListening(true);
    instance.start();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!question) throw new Error('Интервью уже завершено');
      recognition.current?.stop();
      return answerInterview(interview.id, {
        questionId: question.id,
        answer: answer.trim(),
        revision: interview.revision,
      });
    },
    onSuccess: (updated) => {
      setAnswer('');
      setInterim('');
      queryClient.setQueryData(interviewKey(scope, updated.id), updated);
      queryClient.setQueryData(interviewsKey(scope), (current: { items: Interview[] } | undefined) => ({
        items: [updated, ...(current?.items.filter((item) => item.id !== updated.id) ?? [])],
      }));
    },
    onError: (error) => {
      if (isApiError(error, 409))
        void queryClient.invalidateQueries({
          queryKey: interviewKey(scope, interview.id),
        });
    },
  });

  const avatarState = mutation.isPending ? 'thinking' : listening ? 'listening' : speaking ? 'speaking' : 'idle';
  return (
    <div className={styles.interviewPage}>
      <div className={styles.liveHeader}>
        <div>
          <span className={styles.liveBadge}>Интервью идёт</span>
          <h1>Техническое и поведенческое интервью</h1>
        </div>
        <div className={styles.progress}>Вопрос {question?.sequence ?? interview.evidence.length} из 12</div>
      </div>
      <div className={styles.liveGrid}>
        <InterviewGraph interview={interview} />
        <section className={styles.conversation}>
          <Avatar state={avatarState} />
          {question ? (
            <>
              <div className={styles.questionBlock}>
                <span>
                  {interview.nodes.find((node) => node.id === question.nodeId)?.kind === 'behavioral'
                    ? 'Ситуация про взаимодействие'
                    : 'Техническая ситуация'}
                </span>
                <p>{question.prompt}</p>
                <Button size="sm" icon="play" onClick={sayQuestion}>
                  Повторить вслух
                </Button>
              </div>
              <div className={styles.modeSwitch}>
                <Button
                  size="sm"
                  variant={inputMode === 'voice' ? 'primary' : 'secondary'}
                  icon="mic"
                  onClick={() => setInputMode('voice')}
                >
                  Ответить голосом
                </Button>
                <Button
                  size="sm"
                  variant={inputMode === 'text' ? 'primary' : 'secondary'}
                  icon="edit"
                  onClick={() => {
                    recognition.current?.stop();
                    setListening(false);
                    setInputMode('text');
                  }}
                >
                  Перейти к тексту
                </Button>
              </div>
              {inputMode === 'voice' && (
                <div className={styles.voicePanel}>
                  <Button
                    variant={listening ? 'secondary' : 'primary'}
                    icon={listening ? 'stop' : 'mic'}
                    onClick={toggleListening}
                  >
                    {listening ? 'Остановить запись' : answer ? 'Продолжить ответ' : 'Начать ответ'}
                  </Button>
                  <span>
                    {listening ? 'Говорите — текст появляется ниже' : 'Микрофон включается только по нажатию'}
                  </span>
                </div>
              )}
              {speechError && <Callout tone="warning">{speechError}</Callout>}
              <TextareaField
                id="interview-answer"
                label={inputMode === 'voice' ? 'Расшифровка ответа' : 'Ваш ответ'}
                hint={interim ? `Распознаём: ${interim}` : 'Можно отредактировать текст перед отправкой.'}
                rows={6}
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
                Отправить ответ
              </Button>
            </>
          ) : (
            <Callout tone="success" title="Интервью завершено">
              Граф показывает подтверждённые технические навыки и наблюдения по взаимодействию с людьми.
            </Callout>
          )}
        </section>
      </div>
      {interview.evidence.length > 0 && (
        <details className={styles.evidencePanel}>
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
  );
}

export function GraphInterview({ available }: { available: boolean }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const interviews = useQuery({
    ...interviewsQuery(scope),
    enabled: available,
  });
  const start = useMutation({
    mutationFn: startInterview,
    onSuccess: (interview) => {
      queryClient.setQueryData(interviewsKey(scope), (current: { items: Interview[] } | undefined) => ({
        items: [interview, ...(current?.items.filter((item) => item.id !== interview.id) ?? [])],
      }));
      void navigate({ href: `/candidate/interviews/${interview.id}` });
    },
  });
  const active = interviews.data?.items.find((item) => item.status === 'active');
  if (!available) return null;
  return (
    <section className={styles.section}>
      <Card className={styles.launcher}>
        <div className={styles.launcherCopy}>
          <span className={styles.eyebrow}>
            <Icon name="sparkles" size={16} /> Новый формат проверки
          </span>
          <h2>Собеседование по графу навыков</h2>
          <p>
            Живой диалог с голосом и расшифровкой проверяет техническое мышление, коммуникацию, обратную связь и работу
            с разногласиями.
          </p>
          <div className={styles.features}>
            <span>
              <Icon name="mic" size={16} /> Голос или текст
            </span>
            <span>
              <Icon name="branch" size={16} /> Адаптивный маршрут
            </span>
            <span>
              <Icon name="users" size={16} /> Soft skills
            </span>
          </div>
        </div>
        <Button
          variant="primary"
          icon={active ? 'play' : 'sparkles'}
          pending={start.isPending}
          pendingLabel="Открываем…"
          onClick={() => (active ? void navigate({ href: `/candidate/interviews/${active.id}` }) : start.mutate())}
        >
          {active ? 'Продолжить собеседование' : 'Начать собеседование'}
        </Button>
      </Card>
      {interviews.isPending && <LoadingState />}
      {interviews.isError && <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} />}
      {start.error && <Callout tone="warning">{describeError(start.error).message}</Callout>}
      {interviews.data && interviews.data.items.length > 0 && (
        <div className={styles.interviewHistory}>
          <strong>Предыдущие интервью</strong>
          {interviews.data.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void navigate({ href: `/candidate/interviews/${item.id}` })}
            >
              <span>
                {item.status === 'active' ? 'В процессе' : 'Завершено'} · {item.evidence.length} ответов
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
