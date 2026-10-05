import type { components } from '@/shared/api';

type Salary = components['schemas']['Salary'];

const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const formatRub = (value: number) => rub.format(value);
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (value: Date) => time.format(value);

export const salaryPeriodLabel = { month: '₽/мес' } as const satisfies Record<Salary['period'], string>;
export const taxBasisLabel = { gross: 'До вычета налогов' } as const satisfies Record<Salary['taxBasis'], string>;

export function formatSalaryRange(salary: Salary) {
  return `${formatRub(salary.from)} – ${formatRub(salary.to)} ${salaryPeriodLabel[salary.period]}`;
}

/** Whole days from `fromIso` to `toIso`, rounded up; the server clock is the reference for mock data. */
export function daysUntil(fromIso: string, toIso: string) {
  return Math.ceil((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatMonths(months: number | null) {
  if (months === null) return 'Не указан';
  if (months === 0) return 'Нет опыта';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${pluralRu(years, 'год', 'года', 'лет')}`);
  if (rest) parts.push(`${rest} ${pluralRu(rest, 'месяц', 'месяца', 'месяцев')}`);
  return parts.join(' ');
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
