import { Button } from '@/shared/ui';
import styles from './bookmark-button.module.css';

type Props = {
  alias: string;
  shortlistTitle: string | undefined;
  member: boolean;
  pending: boolean;
  onToggle: () => void;
  withLabel?: boolean;
};

export function BookmarkButton({ alias, shortlistTitle, member, pending, onToggle, withLabel }: Props) {
  const target = shortlistTitle ? `подборки «${shortlistTitle}»` : 'подборки';
  const label = member
    ? `Удалить ${alias} из ${target}`
    : `Добавить ${alias} в ${target.replace('подборки', 'подборку')}`;
  return (
    <Button
      variant={withLabel ? 'secondary' : 'quiet'}
      icon="bookmark"
      aria-pressed={member}
      aria-label={withLabel ? undefined : label}
      title={label}
      disabled={pending}
      onClick={onToggle}
      className={member ? styles.member : undefined}
    >
      {withLabel ? (member ? 'В подборке' : 'Добавить в подборку') : undefined}
    </Button>
  );
}
