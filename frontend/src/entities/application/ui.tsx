import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type Status = components['schemas']['Application']['status'];
type View = { label: string; tone: Tone; icon: IconName };

const candidateView: Record<Status, View> = {
  sent: { label: 'Отправлен', tone: 'info', icon: 'send' },
  viewed: { label: 'Просмотрен компанией', tone: 'warning', icon: 'eye' },
  accepted: { label: 'Компания готова к разговору', tone: 'success', icon: 'checkCircle' },
  declined: { label: 'Компания отказала', tone: 'neutral', icon: 'xCircle' },
  withdrawn: { label: 'Отозван вами', tone: 'neutral', icon: 'minusCircle' },
};

const employerView: Record<Status, View> = {
  sent: { label: 'Новый', tone: 'warning', icon: 'clock' },
  viewed: { label: 'Просмотрен · ждёт решения', tone: 'warning', icon: 'eye' },
  accepted: { label: 'Принят', tone: 'success', icon: 'checkCircle' },
  declined: { label: 'Отклонён', tone: 'neutral', icon: 'xCircle' },
  withdrawn: { label: 'Отозван кандидатом', tone: 'neutral', icon: 'minusCircle' },
};

export function ApplicationStatusChip({ status, audience }: { status: Status; audience: 'candidate' | 'employer' }) {
  const view = (audience === 'candidate' ? candidateView : employerView)[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusChip>
  );
}
