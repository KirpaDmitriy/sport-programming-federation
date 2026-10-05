import type { components } from '@/shared/api';
import { gradeLabel, specializationLabel } from '@/shared/lib';
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
