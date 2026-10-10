import type { GitHubSignal } from '@/entities/github-insights';
import { Card, StatusChip } from '@/shared/ui';
import { DimensionList, Flags, IndexSummary, LanguageBar, Numbers, plainListClass } from './parts';

type Props = { signal: GitHubSignal; title?: string; subtitle?: string };

/** The anonymous employer projection: rounded values, no names, links or calendars. */
export function GitHubSignalCard({
  signal,
  title = 'GitHub: публичная активность',
  subtitle = 'Обезличено: без ника, ссылок, названий и точных чисел',
}: Props) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="stack">
        <IndexSummary index={signal.index}>
          <div className="row">
            {signal.ownershipVerified ? (
              <StatusChip tone="success">Владение аккаунтом подтверждено</StatusChip>
            ) : (
              <StatusChip tone="warning">Владение аккаунтом не подтверждено</StatusChip>
            )}
          </div>
        </IndexSummary>
        <p className="small muted">
          Сигнал публичной активности по правилам {signal.algorithmVersion} на {signal.generatedAt}. Он не подтверждает
          навыки и грейд и не влияет на порядок выдачи.
          {signal.mostlyPrivate &&
            ' Основная работа кандидата — в приватных репозиториях, поэтому сигнал может быть занижен.'}
        </p>
        <Flags flags={signal.flags} />
        {signal.highlights.length > 0 && (
          <ul className={`${plainListClass} small`}>
            {signal.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <DimensionList dimensions={signal.dimensions} />
        {signal.rhythm && (
          <Numbers
            items={[
              ['время в активный день', signal.rhythm.hoursPerActiveDay],
              ['будни 9:00–19:00', `≈${signal.rhythm.officeHoursPercent}%`],
              ['выходные', `≈${signal.rhythm.weekendPercent}%`],
            ]}
          />
        )}
        <LanguageBar languages={signal.languages} />
      </div>
    </Card>
  );
}
