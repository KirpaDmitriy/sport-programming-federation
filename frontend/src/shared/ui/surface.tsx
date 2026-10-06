import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { components } from '@/shared/api';
import { formatSalaryRange, taxBasisLabel } from '@/shared/lib';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import styles from './surface.module.css';

type CardProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tinted?: boolean;
  headingLevel?: 2 | 3;
  as?: 'section' | 'div' | 'aside' | 'article';
};

export function Card({
  title,
  subtitle,
  actions,
  tinted,
  headingLevel = 2,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Tag {...rest} className={cx(styles.card, tinted && styles.cardTinted, className)}>
      {(title || actions) && (
        <div className={styles.cardHeader}>
          <div>
            {title && <Heading className={styles.cardTitle}>{title}</Heading>}
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Tag>
  );
}

type PageHeaderProps = { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode };

export function PageHeader({ title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
        {meta && <div className={styles.pageMeta}>{meta}</div>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

const toneIcon: Record<Tone, IconName> = {
  success: 'checkCircle',
  warning: 'alert',
  danger: 'xCircle',
  neutral: 'minusCircle',
  info: 'info',
  accent: 'target',
};

type ChipProps = { tone: Tone; icon?: IconName | null; plain?: boolean; children: ReactNode; className?: string };

/** Status is always conveyed by text; the icon and colour only reinforce it. */
export function StatusChip({ tone, icon, plain, children, className }: ChipProps) {
  const iconName = icon === undefined ? toneIcon[tone] : icon;
  return (
    <span className={cx(styles.chip, styles[tone], plain && styles.plain, className)}>
      {iconName && <Icon name={iconName} size={18} />}
      <span>{children}</span>
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}

export function TagList({ items, label }: { items: string[]; label?: string }) {
  return (
    <ul className={styles.tags} aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Tag>{item}</Tag>
        </li>
      ))}
    </ul>
  );
}

type AvatarProps = { size?: 'sm' | 'md' | 'lg' } & (
  | { kind: 'initials'; text: string }
  | { kind: 'anonymous' }
  | { kind: 'company'; text?: string }
  | { kind: 'icon'; icon: IconName }
);

/** Anonymous avatars never derive initials from a person: employers see a neutral icon. */
export function Avatar(props: AvatarProps) {
  const size = props.size ?? 'md';
  const className = cx(
    styles.avatar,
    size === 'sm' ? styles.avatarSm : size === 'lg' ? styles.avatarLg : styles.avatarMd,
  );
  const iconSize = size === 'lg' ? 44 : size === 'md' ? 26 : 20;
  if (props.kind === 'initials') {
    return (
      <span className={className} aria-hidden="true">
        {props.text}
      </span>
    );
  }
  if (props.kind === 'company' && props.text) {
    return (
      <span className={className} aria-hidden="true">
        {props.text}
      </span>
    );
  }
  const icon = props.kind === 'icon' ? props.icon : props.kind === 'company' ? 'building' : 'user';
  return (
    <span className={className} aria-hidden="true">
      <Icon name={icon} size={iconSize} />
    </span>
  );
}

export function DefinitionList({ items }: { items: Array<{ term: ReactNode; value: ReactNode }> }) {
  return (
    <dl className={styles.dl}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: terms are static labels whose order is their identity
        <div key={index} style={{ display: 'contents' }}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SalaryBlock({ salary }: { salary: components['schemas']['Salary'] }) {
  return (
    <div className={styles.salary}>
      <span className={styles.salaryAmount}>{formatSalaryRange(salary)}</span>
      <span className={styles.salaryBasis}>{taxBasisLabel[salary.taxBasis]}</span>
    </div>
  );
}

/** A horizontally scrollable table; focusable so keyboard users can scroll it when it is wider than the screen. */
export function TableWrap({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
    <section className="table-wrap" tabIndex={0} aria-label={label} style={style}>
      {children}
    </section>
  );
}
