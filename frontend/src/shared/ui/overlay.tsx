import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from './button';
import { cx } from './cx';
import styles from './overlay.module.css';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

/** Native modal dialog: the browser traps focus and handles Escape; focus returns to the opener. */
export function Dialog({ open, onClose, title, description, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, wide && styles.wide)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <div>
              <h2 id={titleId} className={styles.dialogTitle}>
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className={styles.dialogDescription}>
                  {description}
                </p>
              )}
            </div>
            <Button variant="quiet" icon="x" aria-label="Закрыть" onClick={onClose} />
          </div>
          {children}
          {footer && <div className={styles.dialogFooter}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  danger?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  pending,
  danger,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} pending={pending ?? false}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
};

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: TabsProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === value);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = items[(index + delta + items.length) % items.length];
    if (next) {
      onChange(next.id);
      document.getElementById(tabId(idPrefix, next.id))?.focus();
    }
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          id={tabId(idPrefix, item.id)}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={item.id === value}
          aria-controls={panelId(idPrefix, item.id)}
          tabIndex={item.id === value ? 0 : -1}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  options: Array<{ value: T; label: string; disabled?: boolean | undefined; title?: string | undefined }>;
  value: T;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons is not a fieldset form control
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type PaginationProps = { page: number; pageSize: number; total: number; onChange: (page: number) => void };

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label="Страницы">
      <span>
        Страница {page} из {pages}
      </span>
      <span className={styles.paginationButtons}>
        <Button size="sm" icon="arrowLeft" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Назад
        </Button>
        <Button size="sm" iconAfter="arrowRight" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Вперёд
        </Button>
      </span>
    </nav>
  );
}
