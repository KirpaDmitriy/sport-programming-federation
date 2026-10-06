const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const html = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (symbol) => entities[symbol] ?? symbol);
export const initials = (name: string): string =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
export const money = (value: number): string => `${Math.round(value / 1000)}к ₽`;
export const percent = (value: number): string => `${Math.round(value * 100)}%`;
export const formatLabel: Record<string, string> = { remote: 'удалённо', hybrid: 'гибрид', office: 'офис' };
