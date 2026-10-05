import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  type Assessment,
  assessmentQuery,
  assessmentsKey,
  CheckStatusChip,
  isEvaluating,
  RubricOutcomeChip,
} from '@/entities/assessment';
import { eligibilityReasonText, profileKey, profileQuery } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { graphKey, mySkillsQuery, SkillStatusChip, skillsKey } from '@/entities/skill';
import { ExportProfileButton } from '@/features/profile-pdf';
import { useStartAssessment } from '@/features/start-assessment';
import { describeError } from '@/shared/api';
import { formatDate, gradeLabel, initials, specializationLabel, useDocumentTitle } from '@/shared/lib';
import { Avatar, Button, ButtonLink, Callout, Card, Icon, InlineStatus, StatusChip } from '@/shared/ui';
import styles from './result-page.module.css';

function headline(assessment: Assessment) {
  const result = assessment.result;
  const target = gradeLabel[assessment.grade];
  if (!result) return { icon: 'clock' as const, tone: 'info', title: 'Решение проверяется' };
  if (result.outcome === 'service_error')
    return { icon: 'alert' as const, tone: 'warning', title: 'Оценка не получена' };
  if (result.outcome === 'failed') {
    return {
      icon: 'xCircle' as const,
      tone: 'danger',
      title: result.previousGrade ? `${target} пока не подтверждён` : 'Проверка не пройдена',
    };
  }
  return {
    icon: 'checkCircle' as const,
    tone: 'success',
    title: result.gradeChanged ? `${target} подтверждён` : `${target} подтверждён повторно`,
  };
}

function NextActions({ assessment }: { assessment: Assessment }) {
  const scope = useScope();
  const profile = useQuery(profileQuery(scope));
  const start = useStartAssessment();
  const eligibility = profile.data?.assessmentEligibility;
  if (!eligibility) return null;
  return (
    <Card title={assessment.result?.outcome === 'service_error' ? 'Что дальше' : 'Как продолжить'}>
      <div className="stack">
        {assessment.result?.outcome === 'service_error' ? (
          <p>Сбой сервиса не считается попыткой с отрицательным результатом. Можно начать новую попытку сразу.</p>
        ) : assessment.result?.previousGrade ? (
          <p>
            Подтверждённый грейд «{gradeLabel[assessment.result.previousGrade]}» остаётся в профиле. Повторите проверку
            позже или выберите другую цель.
          </p>
        ) : (
          <p>Категория пока не присвоена. Можно повторить проверку или выбрать более подходящий грейд в профиле.</p>
        )}
        <div className="row">
          {eligibility.canStartSelected ? (
            <Button
              variant="primary"
              icon="refresh"
              pending={start.isPending}
              onClick={() =>
                start.mutate({ specialization: eligibility.selectedSpecialization, grade: eligibility.selectedGrade })
              }
            >
              Начать новую попытку · {gradeLabel[eligibility.selectedGrade]}
            </Button>
          ) : (
            <p className="small muted">
              {eligibility.selectedReason
                ? eligibilityReasonText[eligibility.selectedReason]
                : 'Новая попытка пока недоступна.'}
            </p>
          )}
          <ButtonLink to="/candidate/profile">Выбрать другую цель</ButtonLink>
        </div>
        {start.error && <Callout tone="danger">{describeError(start.error).message}</Callout>}
      </div>
    </Card>
  );
}

function EvidenceUpdated({ assessment }: { assessment: Assessment }) {
  const scope = useScope();
  const skills = useQuery(mySkillsQuery(scope));
  if (!skills.data) return null;
  const confirmed = skills.data.items.filter((skill) =>
    skill.evidence.some((evidence) => evidence.reference === assessment.id),
  );
  const gap = skills.data.items.find((skill) => skill.status === 'insufficient');
  return (
    <>
      <Card title="Свидетельства обновлены">
        {confirmed.length ? (
          <div className="stack">
            <p className="muted">
              Навыки из рубрики этой задачи теперь подтверждены на уровне «{gradeLabel[assessment.grade]}»:
            </p>
            <div className="row">
              {confirmed.map((skill) => (
                <StatusChip key={skill.skillId} tone="success">
                  {skill.label}
                </StatusChip>
              ))}
            </div>
            <p className="small muted">
              Подтверждение относится к проверенной задаче и не охватывает все темы этих технологий. Остальные навыки не
              изменились.
            </p>
          </div>
        ) : (
          <InlineStatus>Обновляем навыки профиля…</InlineStatus>
        )}
      </Card>
      {gap && (
        <Card title="Следующий навык" tinted>
          <div className="stack">
            <div className="row">
              <strong style={{ fontSize: '1.25rem' }}>{gap.label}</strong>
              <SkillStatusChip status={gap.status} />
            </div>
            <p className="small muted">
              Свидетельств пока недостаточно. Это пробел в данных, а не отрицательная оценка.
            </p>
            <ButtonLink
              to="/candidate/skills"
              search={{ node: `skill-${gap.skillId}` }}
              variant="primary"
              iconAfter="arrowRight"
            >
              Открыть навык
            </ButtonLink>
          </div>
        </Card>
      )}
    </>
  );
}

export function AssessmentResultPage({ assessmentId }: { assessmentId: string }) {
  useDocumentTitle('Результат проверки');
  const scope = useScope();
  const queryClient = useQueryClient();
  const { data: assessment } = useSuspenseQuery({
    ...assessmentQuery(scope, assessmentId),
    refetchInterval: (query) => (query.state.data && isEvaluating(query.state.data) ? 600 : false),
  });
  const profile = useQuery(profileQuery(scope));
  const terminal = !isEvaluating(assessment) && assessment.result !== null;

  useEffect(() => {
    if (!terminal) return;
    // The final outcome can change category and evidence; refresh everything derived from them.
    for (const queryKey of [profileKey(scope), skillsKey(scope), graphKey(scope), assessmentsKey(scope)]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [terminal, queryClient, scope]);

  const result = assessment.result;
  const head = headline(assessment);
  const profileUpdated =
    result?.outcome === 'passed' &&
    profile.data?.verifiedGrade === result.confirmedGrade &&
    profile.data?.verifiedSpecialization === assessment.specialization;

  return (
    <>
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[head.tone]}`}>
          <Icon name={head.icon} size={30} />
        </span>
        <div>
          <h1 className={styles.title}>{head.title}</h1>
          <p className="muted" style={{ fontSize: '1.125rem' }}>
            {specializationLabel[assessment.specialization]} · практическая проверка{' '}
            {result ? `завершена ${formatDate(assessment.updatedAt)}` : 'ещё оценивается'}
          </p>
        </div>
      </header>

      {!result && (
        <Card>
          <div className="stack">
            <InlineStatus>Решение проверяется. Страницу можно закрыть — результат сохранится в истории.</InlineStatus>
            <p className="small muted">Текущий подтверждённый грейд сохраняется до итогового результата.</p>
          </div>
        </Card>
      )}

      {result && (
        <div className="stack-lg">
          <Card className={result.outcome === 'passed' ? styles.successCard : undefined}>
            <div className={styles.summary}>
              {profile.data && (
                <div className="row">
                  <Avatar kind="initials" text={initials(profile.data.name)} size="md" />
                  <div>
                    <strong>{profile.data.name}</strong>
                    <div className="small muted">{profile.data.alias}</div>
                  </div>
                </div>
              )}
              <div className={styles.change}>
                <span className={styles.grade}>
                  Было: <strong>{result.previousGrade ? gradeLabel[result.previousGrade] : 'не подтверждён'}</strong>
                </span>
                <Icon name="arrowRight" />
                <span className={styles.grade}>
                  Теперь:{' '}
                  <strong>{result.confirmedGrade ? gradeLabel[result.confirmedGrade] : 'не подтверждён'}</strong>
                </span>
              </div>
              <span className="row">
                {result.outcome === 'passed' ? (
                  profileUpdated ? (
                    <StatusChip tone="success">Профиль обновлён автоматически</StatusChip>
                  ) : (
                    <InlineStatus>Обновляем профиль…</InlineStatus>
                  )
                ) : (
                  <StatusChip tone="neutral" icon="lock">
                    Грейд не изменился
                  </StatusChip>
                )}
              </span>
            </div>
            <p style={{ marginTop: '1rem' }}>{result.feedback}</p>
            {result.outcome === 'service_error' && (
              <p className="small muted">
                Штрафа и дополнительного ожидания нет; отрицательные оценки по критериям не выставлялись.
              </p>
            )}
            {result.nextEligibleAt && result.outcome === 'passed' && result.gradeChanged && (
              <p className="small muted">Следующая смена грейда — не раньше {formatDate(result.nextEligibleAt)}.</p>
            )}
          </Card>

          <div className="split">
            <div className="stack-lg">
              {result.rubric.length > 0 && (
                <Card title="Результаты по критериям">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Критерий</th>
                          <th scope="col">Результат</th>
                          <th scope="col">Основание</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rubric.map((item) => (
                          <tr key={item.criterionId}>
                            <td>
                              <strong>{item.label}</strong>
                            </td>
                            <td>
                              <RubricOutcomeChip outcome={item.outcome} />
                            </td>
                            <td>{item.feedback}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              {result.checks.length > 0 && (
                <Card title="Результаты запуска">
                  <ul className={styles.checks}>
                    {result.checks.map((check) => (
                      <li key={check.id}>
                        <span>{check.label}</span>
                        <CheckStatusChip status={check.status} />
                      </li>
                    ))}
                  </ul>
                  <p className="small muted" style={{ marginTop: '0.75rem' }}>
                    Учтены проверки поведения и общая рубрика семейства задач «{assessment.task.family}», версия{' '}
                    {assessment.task.version}.{result.simulation && ' Результаты симулированы для демонстрации.'}
                  </p>
                </Card>
              )}
            </div>
            <div className="stack-lg">
              {result.outcome === 'passed' ? (
                <EvidenceUpdated assessment={assessment} />
              ) : (
                <NextActions assessment={assessment} />
              )}
            </div>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <ButtonLink to="/candidate/overview" variant="primary" iconAfter="arrowRight">
          Открыть профиль
        </ButtonLink>
        <ExportProfileButton />
        <Link to="/candidate/assessments">История попыток →</Link>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          <Icon name="info" size={16} /> ИИ был разрешён на всех этапах
        </span>
      </div>
    </>
  );
}
