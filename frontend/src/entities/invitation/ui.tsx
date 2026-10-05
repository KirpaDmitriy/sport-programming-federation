import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type Status = components['schemas']['Invitation']['status'];
type View = { label: string; tone: Tone; icon: IconName };

const candidateView: Record<Status, View> = {
  sent: { label: 'Ожидает вашего решения', tone: 'warning', icon: 'clock' },
  viewed: { label: 'Просмотрено · ждёт решения', tone: 'warning', icon: 'clock' },
  accepted: { label: 'Принято', tone: 'success', icon: 'checkCircle' },
  declined: { label: 'Отклонено', tone: 'neutral', icon: 'xCircle' },
  withdrawn: { label: 'Отозвано компанией', tone: 'neutral', icon: 'minusCircle' },
};

const employerView: Record<Status, View> = {
  sent: { label: 'Отправлено', tone: 'info', icon: 'send' },
  viewed: { label: 'Просмотрено', tone: 'warning', icon: 'eye' },
  accepted: { label: 'Принято кандидатом', tone: 'success', icon: 'checkCircle' },
  declined: { label: 'Отклонено кандидатом', tone: 'neutral', icon: 'xCircle' },
  withdrawn: { label: 'Отозвано', tone: 'neutral', icon: 'minusCircle' },
};

export function InvitationStatusChip({ status, audience }: { status: Status; audience: 'candidate' | 'employer' }) {
  const view = (audience === 'candidate' ? candidateView : employerView)[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusChip>
  );
}
