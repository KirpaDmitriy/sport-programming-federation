import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { describeError } from '@/shared/api';
import { Button } from './button';
import { cx } from './cx';
import styles from './feedback.module.css';
import { Icon, type IconName } from './icon';
import type { Tone } from './surface';

const calloutIcon: Record<Tone, IconName> = {
  success: 'checkCircle',
  warning: 'alert',
  danger: 'alert',
  neutral: 'info',
  info: 'info',
  accent: 'sparkles',
};

type CalloutProps = {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  role?: 'status' | 'alert';
  className?: string;
};

export function Callout({ tone = 'info', title, children, actions, icon, role, className }: CalloutProps) {
  return (
    <div className={cx(styles.callout, styles[tone], className)} role={role}>
      <Icon name={icon ?? calloutIcon[tone]} />
      <div className={styles.calloutBody}>
        {title && <p className={styles.calloutTitle}>{title}</p>}
        {children && <div className={styles.calloutText}>{children}</div>}
        {actions && <div className={styles.calloutActions}>{actions}</div>}
      </div>
    </div>
  );
}

type EmptyStateProps = { icon?: IconName; title: ReactNode; children?: ReactNode; actions?: ReactNode };

export function EmptyState({ icon = 'inbox', title, children, actions }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={26} />
      </span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {children && <p className={styles.emptyText}>{children}</p>}
      {actions}
    </div>
  );
}

type ErrorStateProps = { error: unknown; onRetry?: () => void; retrying?: boolean; title?: string };

export function ErrorState({ error, onRetry, retrying, title }: ErrorStateProps) {
  const description = describeError(error);
  return (
    <Callout
      tone="danger"
      role="alert"
      title={title ?? description.title}
      actions={
        onRetry && (
          <Button size="sm" icon="refresh" onClick={onRetry} pending={retrying ?? false} pendingLabel="Повторяем…">
            Повторить
          </Button>
        )
      }
    >
      <p style={{ margin: 0 }}>{description.message}</p>
      {description.requestId && <p className={styles.requestId}>Код запроса: {description.requestId}</p>}
    </Callout>
  );
}

export function LoadingState({ label = 'Загружаем данные…', lines = 4 }: { label?: string; lines?: number }) {
  return (
    <div className={styles.skeletonGroup} role="status">
      <span className={styles.loadingText}>{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          key={index}
          className={styles.skeleton}
          style={{ width: `${92 - index * 11}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function InlineStatus({ children, busy = true }: { children: ReactNode; busy?: boolean }) {
  return (
    <span className={styles.inlineStatus} role="status">
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </span>
  );
}

type Toast = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const show = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((items) => [...items.slice(-2), { id, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toasts} aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <Icon name="checkCircle" />
            <span>{toast.message}</span>
            <button type="button" aria-label="Скрыть уведомление" onClick={() => dismiss(toast.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
