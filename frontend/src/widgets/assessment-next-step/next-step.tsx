import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { assessmentsQuery, isEditable, isEvaluating } from '@/entities/assessment';
import { useMeta } from '@/entities/meta';
import { eligibilityReasonText, type Profile } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { useStartAssessment } from '@/features/start-assessment';
import { describeError } from '@/shared/api';
import { daysUntil, formatDate, gradeLabel, pluralRu, specializationLabel } from '@/shared/lib';
import { Button, ButtonLink, Callout, Card, ErrorState, Icon, LoadingState } from '@/shared/ui';

/** The primary assessment action, driven only by the server's eligibility and attempt state. */
export function AssessmentNextStep({ profile }: { profile: Profile }) {
  const scope = useScope();
  const meta = useMeta();
  const assessments = useQuery(assessmentsQuery(scope));
  const start = useStartAssessment();
  const eligibility = profile.assessmentEligibility;
  const target = `${specializationLabel[eligibility.selectedSpecialization]} · ${gradeLabel[eligibility.selectedGrade]}`;

  if (assessments.isPending) {
    return (
      <Card title="Следующий шаг" tinted>
        <LoadingState lines={2} />
      </Card>
    );
  }
  if (assessments.isError) {
    return (
      <Card title="Следующий шаг" tinted>
        <ErrorState error={assessments.error} onRetry={() => assessments.refetch()} retrying={assessments.isFetching} />
      </Card>
    );
  }

  const active = assessments.data.items.find((item) => isEditable(item) || isEvaluating(item));
  let body: ReactNode;

  if (!profile.onboarding.questionnaireComplete || !profile.consents.processing) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>Заполните анкету</h3>
        <p className="muted">Отрасль, специализация, стек и согласие на обработку нужны, чтобы назначить проверку.</p>
        <ButtonLink to="/candidate/onboarding" variant="primary" iconAfter="arrowRight">
          Продолжить анкету
        </ButtonLink>
      </>
    );
  } else if (active && isEditable(active)) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>Продолжите проверку</h3>
        <p className="muted">
          {specializationLabel[active.specialization]} · {gradeLabel[active.grade]}. Черновик сохранён на сервере.
        </p>
        <ButtonLink
          to="/candidate/assessments/$assessmentId/workspace"
          params={{ assessmentId: active.id }}
          variant="primary"
          iconAfter="arrowRight"
        >
          Продолжить проверку
        </ButtonLink>
      </>
    );
  } else if (active) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>Решение проверяется</h3>
        <p className="muted">Текущий подтверждённый грейд сохраняется до итогового результата.</p>
        <ButtonLink to="/candidate/assessments/$assessmentId/result" params={{ assessmentId: active.id }}>
          Открыть статус
        </ButtonLink>
      </>
    );
  } else if (eligibility.canStartSelected) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>
          {profile.verifiedGrade ? `Подтвердить ${gradeLabel[eligibility.selectedGrade]}` : 'Подтвердить уровень'}
        </h3>
        <p className="muted">{target}. Тест знаний с выбором ответов, ИИ разрешён.</p>
        <Button
          variant="primary"
          iconAfter="arrowRight"
          pending={start.isPending}
          pendingLabel="Создаём проверку…"
          onClick={() =>
            start.mutate({ specialization: eligibility.selectedSpecialization, grade: eligibility.selectedGrade })
          }
        >
          Начать проверку
        </Button>
        {profile.verifiedGrade && (
          <p className="small muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Icon name="info" size={16} />
            Текущий грейд сохранится при любом результате
          </p>
        )}
        {start.error && <Callout tone="danger">{describeError(start.error).message}</Callout>}
      </>
    );
  } else {
    const days = eligibility.nextEligibleAt ? daysUntil(meta.serverTime, eligibility.nextEligibleAt) : null;
    body = (
      <>
        <h3 style={{ margin: 0 }}>
          {eligibility.selectedReason === 'cooldown' ? 'Смена грейда пока недоступна' : 'Проверка недоступна'}
        </h3>
        <p className="muted">
          {eligibility.selectedReason ? eligibilityReasonText[eligibility.selectedReason] : 'Проверка пока недоступна.'}
        </p>
        {eligibility.selectedReason === 'cooldown' && eligibility.nextEligibleAt && (
          <p>
            Доступно с <strong>{formatDate(eligibility.nextEligibleAt)}</strong>
            {days !== null && days > 0 && ` (через ${days} ${pluralRu(days, 'день', 'дня', 'дней')})`}. Интервал между
            успешными сменами грейда — {eligibility.cooldownDays}{' '}
            {pluralRu(eligibility.cooldownDays, 'день', 'дня', 'дней')}.
          </p>
        )}
        <ButtonLink to="/candidate/profile">Изменить цель проверки</ButtonLink>
      </>
    );
  }

  return (
    <Card title="Следующий шаг" tinted>
      <div className="stack">{body}</div>
    </Card>
  );
}
