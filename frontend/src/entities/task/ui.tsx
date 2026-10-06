import type { components } from '@/shared/api';
import type { IconName } from '@/shared/ui';
import { StatusChip, type Tone } from '@/shared/ui';

type Status = components['schemas']['TaskResponse']['status'];
type View = { label: string; tone: Tone; icon: IconName };

const views: Record<Status, View> = {
  submitted: { label: 'Ждёт оценки компании', tone: 'info', icon: 'clock' },
  accepted: { label: 'Засчитано', tone: 'success', icon: 'checkCircle' },
  needs_work: { label: 'Нужно доработать', tone: 'warning', icon: 'alert' },
};

export function TaskResponseStatusChip({ status }: { status: Status }) {
  const view = views[status];
  return (
    <StatusChip tone={view.tone} icon={view.icon}>
      {view.label}
    </StatusChip>
  );
}
