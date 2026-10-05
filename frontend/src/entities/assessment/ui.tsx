import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type Status = components['schemas']['Assessment']['status'];
type CheckStatus = components['schemas']['Check']['status'];
type Outcome = components['schemas']['RubricOutcome']['outcome'];

const statusView: Record<Status, { label: string; tone: Tone; icon: IconName }> = {
  draft: { label: 'Начата', tone: 'info', icon: 'edit' },
  in_progress: { label: 'В работе', tone: 'info', icon: 'edit' },
  submitted: { label: 'Решение отправлено', tone: 'info', icon: 'clock' },
  evaluating: { label: 'Решение проверяется', tone: 'info', icon: 'clock' },
  passed: { label: 'Пройдена', tone: 'success', icon: 'checkCircle' },
  failed: { label: 'Не пройдена', tone: 'danger', icon: 'xCircle' },
  service_error: { label: 'Сбой оценивания', tone: 'warning', icon: 'alert' },
};

export function AssessmentStatusChip({ status }: { status: Status }) {
  const view = statusView[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusChip>
  );
}

const checkView: Record<CheckStatus, { label: string; tone: Tone; icon: IconName }> = {
  passed: { label: 'Пройдено', tone: 'success', icon: 'checkCircle' },
  failed: { label: 'Доработать', tone: 'warning', icon: 'alert' },
  not_run: { label: 'Не запущено', tone: 'neutral', icon: 'minusCircle' },
};

export function CheckStatusChip({ status }: { status: CheckStatus }) {
  const view = checkView[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon} plain>
      {view.label}
    </StatusChip>
  );
}

const outcomeView: Record<Outcome, { label: string; tone: Tone }> = {
  met: { label: 'Выполнено', tone: 'success' },
  partial: { label: 'Частично', tone: 'warning' },
  not_met: { label: 'Не выполнено', tone: 'danger' },
};

export function RubricOutcomeChip({ outcome }: { outcome: Outcome }) {
  const view = outcomeView[outcome];
  return (
    <StatusChip tone={view.tone} plain>
      {view.label}
    </StatusChip>
  );
}
