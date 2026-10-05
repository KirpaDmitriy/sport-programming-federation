import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type SkillStatus = components['schemas']['Skill']['status'];

export const skillStatusView: Record<SkillStatus, { label: string; tone: Tone; icon: IconName }> = {
  confirmed: { label: 'Проверено', tone: 'success', icon: 'checkCircle' },
  evidence: { label: 'Есть свидетельства', tone: 'warning', icon: 'alert' },
  observed: { label: 'Найдено в работе', tone: 'neutral', icon: 'eye' },
  insufficient: { label: 'Недостаточно данных', tone: 'neutral', icon: 'minusCircle' },
};

export function SkillStatusChip({ status, plain }: { status: SkillStatus; plain?: boolean }) {
  const view = skillStatusView[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon} plain={plain ?? false}>
      {view.label}
    </StatusChip>
  );
}
