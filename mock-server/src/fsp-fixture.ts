import type { components } from './generated/schema.d.ts';

/** Behavior fixture for the development API; the real backend uses the HTTP simulator. */
export function fspResults(account: string): components['schemas']['FspResult'][] {
  const id = account.trim().toUpperCase();
  if (!['FSP-DEMO-024', 'FSP-DEMO-031', 'FSP-DEMO-PENDING', 'FSP-DEMO-DQ'].includes(id)) return [];
  const pending = id === 'FSP-DEMO-PENDING';
  const disqualified = id === 'FSP-DEMO-DQ';
  const published = !pending && !disqualified;
  const result: components['schemas']['FspResult'][] = [
    {
      competitionId: 'competition-demo-api',
      competitionName: 'Учебный кубок API 2026 (вымышленное событие)',
      discipline: 'Продуктовое программирование',
      startsAt: '2026-09-20T09:00:00Z',
      endsAt: '2026-09-21T18:00:00Z',
      scope: 'team',
      teamName: 'Команда Пример',
      teamSize: 4,
      status: pending ? 'pending' : disqualified ? 'disqualified' : 'published',
      place: published ? 3 : null,
      fieldSize: 18,
      score: published ? 82 : null,
      protocolReference: pending ? null : 'DEMO-PROTOCOL-API-2026-01',
      publishedAt: pending ? null : '2026-09-22T12:00:00Z',
      synthetic: true,
    },
  ];
  if (id === 'FSP-DEMO-031')
    result.push({
      competitionId: 'competition-demo-algorithms',
      competitionName: 'Учебный алгоритмический турнир (вымышленное событие)',
      discipline: 'Алгоритмическое программирование',
      startsAt: '2026-09-24T09:00:00Z',
      endsAt: '2026-09-24T14:00:00Z',
      scope: 'individual',
      teamName: null,
      teamSize: null,
      status: 'pending',
      place: null,
      fieldSize: 48,
      score: null,
      protocolReference: null,
      publishedAt: null,
      synthetic: true,
    });
  return result;
}
