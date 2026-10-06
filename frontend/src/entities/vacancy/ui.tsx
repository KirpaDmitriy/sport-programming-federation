import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type MatchStatus = components['schemas']['Match']['status'];
type View = { label: string; tone: Tone; icon: IconName };

const fitView: Record<MatchStatus, View> = {
  meets_required: { label: 'Вы подходите по обязательным требованиям', tone: 'success', icon: 'checkCircle' },
  needs_verification: { label: 'Часть требований стоит подтвердить', tone: 'warning', icon: 'alert' },
  missing_required: { label: 'Не хватает подтверждений по обязательным навыкам', tone: 'neutral', icon: 'minusCircle' },
};

/** The fit of the signed-in candidate as the server computed it from their verified profile. */
export function VacancyFitChip({ status }: { status: MatchStatus }) {
  const view = fitView[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusChip>
  );
}
