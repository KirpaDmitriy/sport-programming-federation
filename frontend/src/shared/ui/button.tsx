import { createLink } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react';
import styles from './button.module.css';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Look = {
  variant?: Variant | undefined;
  size?: 'md' | 'sm' | undefined;
  icon?: IconName | undefined;
  iconAfter?: IconName | undefined;
  block?: boolean | undefined;
};

function lookClass({ variant = 'secondary', size = 'md', block }: Look, iconOnly: boolean, className?: string) {
  return cx(
    styles.button,
    styles[variant],
    size === 'sm' && styles.sm,
    block && styles.block,
    iconOnly && styles.iconOnly,
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Look & { pending?: boolean; pendingLabel?: string; ref?: Ref<HTMLButtonElement> };

export function Button({
  variant,
  size,
  icon,
  iconAfter,
  block,
  pending = false,
  pendingLabel,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconOnly = !children && Boolean(icon);
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={lookClass({ variant, size, block }, iconOnly, className)}
    >
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : icon && <Icon name={icon} />}
      {pending && pendingLabel ? pendingLabel : children}
      {iconAfter && !pending && <Icon name={iconAfter} />}
    </button>
  );
}

type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & Look & { ref?: Ref<HTMLAnchorElement> };

function StyledAnchor({ variant, size, icon, iconAfter, block, className, children, ...rest }: AnchorProps) {
  return (
    <a {...rest} className={lookClass({ variant, size, block }, !children && Boolean(icon), className)}>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </a>
  );
}

export const ButtonLink = createLink(StyledAnchor);
