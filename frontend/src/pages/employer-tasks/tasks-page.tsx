import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { skillLabel, useMeta } from '@/entities/meta';
import { useScope } from '@/entities/session';
import { companyTasksQuery, TaskResponseStatusChip, taskModeLabel, taskResponsesQuery } from '@/entities/task';
import { ArchiveTask, TaskDialog } from '@/features/author-task';
import { TaskReviewForm } from '@/features/review-task-response';
import { formatDate, formatDateTime, gradeLabel, useDocumentTitle } from '@/shared/lib';
import { Button, Card, EmptyState, PageHeader, StatusChip, type TabItem, Tabs } from '@/shared/ui';

export type EmployerTasksTab = 'tasks' | 'responses';

type Props = { tab: EmployerTasksTab; onTabChange: (tab: EmployerTasksTab) => void };

export function EmployerTasksPage({ tab, onTabChange }: Props) {
  useDocumentTitle('Задания');
  const scope = useScope();
  const meta = useMeta();
  const { data: tasks } = useSuspenseQuery(companyTasksQuery(scope));
  const { data: responses } = useSuspenseQuery({ ...taskResponsesQuery(scope), refetchOnWindowFocus: 'always' });
  const [creating, setCreating] = useState(false);
  const pending = responses.items.filter((item) => item.status === 'submitted').length;
  const tabs: TabItem<EmployerTasksTab>[] = [
    { id: 'tasks', label: 'Задания', count: tasks.items.length },
    { id: 'responses', label: 'Ответы кандидатов', count: pending },
  ];

  return (
    <>
      <PageHeader
        title="Задания"
        subtitle="Короткие задачи, которые платформа раз в неделю предлагает подходящим кандидатам. Ответы дают свежий сигнал о кандидате."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Новое задание
          </Button>
        }
      />
      <Card>
        <Tabs items={tabs} value={tab} onChange={onTabChange} label="Задания и ответы" idPrefix="company-tasks" />
        <div role="tabpanel" id={`company-tasks-panel-${tab}`} aria-labelledby={`company-tasks-tab-${tab}`}>
          {tab === 'tasks' &&
            (tasks.items.length === 0 ? (
              <EmptyState
                icon="target"
                title="Заданий пока нет"
                actions={
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Добавить задание
                  </Button>
                }
              >
                Добавьте короткую задачу по навыку — платформа предложит её кандидатам с подходящим грейдом.
              </EmptyState>
            ) : (
              <ul className="stack" style={{ margin: '1rem 0 0', padding: 0, listStyle: 'none' }}>
                {tasks.items.map((task) => (
                  <li key={task.id}>
                    <Card as="article" headingLevel={3}>
                      <div className="stack">
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="stack" style={{ gap: '0.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{task.title}</h3>
                            <span className="small muted">
                              {skillLabel(meta, task.skillId)} · от {gradeLabel[task.grade]} · около{' '}
                              {task.estimateMinutes} мин · добавлено {formatDate(task.createdAt)}
                            </span>
                          </div>
                          {task.status === 'active' ? (
                            <StatusChip tone="success" icon="activity">
                              Предлагается кандидатам
                            </StatusChip>
                          ) : (
                            <StatusChip tone="neutral" icon="minusCircle">
                              В архиве
                            </StatusChip>
                          )}
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{task.prompt}</p>
                        <div className="row">
                          <span className="small">Ответов: {task.responseCount}</span>
                          <ArchiveTask task={task} />
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ))}
          {tab === 'responses' &&
            (responses.items.length === 0 ? (
              <EmptyState icon="inbox" title="Ответов пока нет">
                Кандидаты получают задания раз в неделю; ответы появятся здесь.
              </EmptyState>
            ) : (
              <ul className="stack" style={{ margin: '1rem 0 0', padding: 0, listStyle: 'none' }}>
                {responses.items.map((response) => (
                  <li key={response.id}>
                    <Card as="article" headingLevel={3}>
                      <div className="stack">
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="stack" style={{ gap: '0.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>
                              <Link
                                to="/employer/candidates/$candidateId"
                                params={{ candidateId: response.candidateId }}
                              >
                                {response.candidateAlias}
                              </Link>
                              {' · '}
                              {response.task.title}
                            </h3>
                            <span className="small muted">
                              {taskModeLabel[response.mode]} · {formatDateTime(response.submittedAt)}
                            </span>
                          </div>
                          <TaskResponseStatusChip status={response.status} />
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{response.answer}</p>
                        {response.status === 'submitted' ? (
                          <TaskReviewForm response={response} />
                        ) : (
                          response.feedback && <p className="small muted">Ваш комментарий: {response.feedback}</p>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Card>
      <TaskDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
