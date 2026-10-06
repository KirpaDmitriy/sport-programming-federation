import type { components } from '@/shared/api';
import { formatDate, gradeLabel, specializationLabel } from '@/shared/lib';
import { StatusChip } from '@/shared/ui';

type Grade = components['schemas']['Profile']['selectedGrade'];
type Specialization = components['schemas']['Profile']['specialization'];

type VerifiedProps = { grade: Grade | null; specialization?: Specialization | null; withSpecialization?: boolean };

/** The only badge that may state a confirmed grade; it is fed by server-verified fields. */
export function VerifiedGradeBadge({ grade, specialization, withSpecialization }: VerifiedProps) {
  if (!grade) return <StatusChip tone="neutral">Уровень ещё не подтверждён</StatusChip>;
  const prefix = withSpecialization && specialization ? `${specializationLabel[specialization]} · ` : '';
  return <StatusChip tone="success">{`${prefix}${gradeLabel[grade]} подтверждён`}</StatusChip>;
}

export function TargetGradeBadge({ grade }: { grade: Grade }) {
  return (
    <StatusChip tone="info" icon="chart">
      Цель: {gradeLabel[grade]}
    </StatusChip>
  );
}

export function qualificationText(specialization: Specialization | null, grade: Grade | null) {
  if (!specialization || !grade) return 'Категория не присвоена';
  return `${specializationLabel[specialization]} · ${gradeLabel[grade]}`;
}

type Freshness = components['schemas']['Freshness'];

/** How recent the last server-counted signal is: a verified grade or a short task the company did not reject. */
export function FreshnessChip({ freshness }: { freshness: Freshness }) {
  if (!freshness.lastSignalAt) {
    return (
      <StatusChip tone="neutral" icon="clock">
        Свежих подтверждений нет
      </StatusChip>
    );
  }
  const what = freshness.lastSignal === 'task' ? 'задание' : 'проверка';
  const when = formatDate(freshness.lastSignalAt);
  return freshness.fresh ? (
    <StatusChip tone="success" icon="activity">
      Профиль актуален · {what} {when}
    </StatusChip>
  ) : (
    <StatusChip tone="neutral" icon="clock">
      Давно не обновлялся · {what} {when}
    </StatusChip>
  );
}
