import { Link, type LinkProps } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import type { Session } from '@/entities/session';
import { useLogout } from '@/features/auth';
import { initials } from '@/shared/lib';
import { Avatar, Icon } from '@/shared/ui';
import styles from './app-shell.module.css';

type Props = { session: Session; settingsTo: NonNullable<LinkProps['to']> };

export function AccountMenu({ session, settingsTo }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = session.displayName || (session.role === 'candidate' ? 'Кандидат' : 'Компания');
  return (
    <div className={styles.account} ref={container}>
      <button
        type="button"
        className={styles.accountButton}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Аккаунт: ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar kind="initials" text={initials(label) || '•'} size="sm" />
        <Icon name="chevronDown" size={18} />
      </button>
      {open && (
        <div className={styles.menu} id={menuId}>
          <div className={styles.menuHeader}>
            <strong>{label}</strong>
            <span className="small muted">{session.role === 'candidate' ? 'Кандидат' : 'Работодатель'}</span>
          </div>
          <Link to={settingsTo} className={styles.menuItem} onClick={() => setOpen(false)}>
            <Icon name="sliders" />
            Настройки
          </Link>
          <button type="button" className={styles.menuItem} disabled={logout.isPending} onClick={() => logout.mutate()}>
            <Icon name="logout" />
            {logout.isPending ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      )}
    </div>
  );
}
