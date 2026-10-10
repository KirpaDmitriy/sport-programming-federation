import type { ReactNode } from 'react';
import { formatMinutes, formatOffset, type GitHubReport, hygieneLabel, yearsLabel } from '@/entities/github-insights';
import { skillLabel, useMeta } from '@/entities/meta';
import { isDemoReference } from '@/entities/source';
import { formatDate, pluralRu } from '@/shared/lib';
import { Card, StatusChip, TableWrap, TagList } from '@/shared/ui';
import {
  ActivityCalendar,
  DimensionList,
  Flags,
  HourChart,
  IndexSummary,
  LanguageBar,
  Numbers,
  plainListClass,
  WeekdayChart,
} from './parts';

const count = (value: number) => value.toLocaleString('ru-RU');

/** Fixture links identify synthetic data and are not hosted pages. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (isDemoReference(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
const share = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`);

function Rhythm({ rhythm }: { rhythm: NonNullable<GitHubReport['rhythm']> }) {
  const sessions = rhythm.sessionsPerActiveDayTenths / 10;
  return (
    <Card title="Ритм работы" subtitle={`По ${count(rhythm.sampleSize)} коммитам выборки, местное время автора`}>
      <div className="stack">
        <Numbers
          items={[
            ['время в активный день, медиана', formatMinutes(rhythm.medianMinutesPerActiveDay)],
            ['в напряжённые дни (90-й перцентиль)', formatMinutes(rhythm.p90MinutesPerActiveDay)],
            ['сессий в активный день', sessions.toLocaleString('ru-RU')],
            ['самая длинная сессия', formatMinutes(rhythm.longestSessionMinutes)],
            ['будни 9:00–19:00', share(rhythm.officeHoursPercent)],
            ['вечер после 19:00', share(rhythm.eveningPercent)],
            ['ночь до 6:00', share(rhythm.nightPercent)],
            ['выходные', share(rhythm.weekendPercent)],
          ]}
        />
        <div className="split-even">
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Коммиты по часам</strong>
            <HourChart hourly={rhythm.hourlyPercent} />
          </div>
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Коммиты по дням недели</strong>
            <WeekdayChart weekdays={rhythm.weekdayPercent} />
          </div>
        </div>
        <p className="small muted">
          {rhythm.timezoneInferred
            ? `Часовой пояс из заголовков коммитов: ${rhythm.timezoneOffsets
                .map((item) => `${formatOffset(item.offsetMinutes)} (${item.percent}%)`)
                .join(', ')}.`
            : 'Часовой пояс не определён: время показано в UTC.'}{' '}
          Сессия — коммиты с перерывами не больше двух часов плюс 30 минут до первого коммита. Это оценка по отметкам
          времени, а не учёт рабочего времени.
        </p>
      </div>
    </Card>
  );
}

/** The candidate's full report: exact values, names and links stay with the candidate. */
export function GitHubReportView({ report }: { report: GitHubReport }) {
  const meta = useMeta();
  const { activity, collaboration, craft, coverage } = report;
  return (
    <div className="stack-lg">
      <Card title="Индекс публичной активности GitHub" subtitle={`Алгоритм ${report.algorithmVersion}`}>
        <div className="stack">
          <IndexSummary index={report.index}>
            <span className="small">
              Объём, регулярность и качество публичных свидетельств за {yearsLabel(coverage.yearsAnalyzed)}. Это не
              оценка навыков: грейд подтверждает только тест знаний.
            </span>
          </IndexSummary>
          <p className="small muted">
            Выборка: {count(coverage.commitsSampled)} коммитов из {coverage.repositoriesAnalyzed}{' '}
            {pluralRu(coverage.repositoriesAnalyzed, 'репозитория', 'репозиториев', 'репозиториев')}, всего публичных
            коммитов по счётчику GitHub — {count(coverage.commitContributions)}. Обновлено{' '}
            {formatDate(report.generatedAt)}
          </p>
          {coverage.notes.length > 0 && (
            <ul className={`${plainListClass} small muted`}>
              {coverage.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <Flags flags={report.flags} />
        </div>
      </Card>

      <Card title="Из чего складывается индекс" subtitle="Пороговые правила, одинаковые для всех кандидатов">
        <DimensionList dimensions={report.dimensions} />
      </Card>

      <Card title="Активность" subtitle="Только вклад в публичные репозитории">
        <div className="stack">
          <Numbers
            items={[
              ['вклад за год', count(activity.contributionsLastYear)],
              ['активных дней за год', count(activity.activeDaysLastYear)],
              ['активных недель из 52', activity.activeWeeksLastYear],
              ['дней подряд, рекорд', activity.longestDailyStreak],
              ['дней подряд, сейчас', activity.currentDailyStreak],
              ['недель подряд, рекорд', activity.longestWeeklyStreak],
              ['самый долгий перерыв, дней', activity.longestGapDaysLastYear],
              [
                'динамика за полгода',
                activity.trendPercent === null
                  ? '—'
                  : `${activity.trendPercent > 0 ? '+' : ''}${activity.trendPercent}%`,
              ],
            ]}
          />
          <ActivityCalendar days={activity.calendar} />
          {activity.privateContributionsLastYear > 0 && (
            <p className="small muted">
              GitHub показывает ещё {count(activity.privateContributionsLastYear)} приватных вкладов за год. Их нельзя
              проверить, поэтому они не входят в индекс.
            </p>
          )}
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Публичный вклад по годам</caption>
              <thead>
                <tr>
                  <th scope="col">Год</th>
                  <th scope="col">Вклад</th>
                  <th scope="col">Коммиты</th>
                  <th scope="col">PR</th>
                  <th scope="col">Ревью</th>
                  <th scope="col">Активных дней</th>
                </tr>
              </thead>
              <tbody>
                {activity.yearly.map((year) => (
                  <tr key={year.year}>
                    <td>{year.year}</td>
                    <td>{count(year.contributions)}</td>
                    <td>{count(year.commits)}</td>
                    <td>{count(year.pullRequests)}</td>
                    <td>{count(year.reviews)}</td>
                    <td>{year.activeDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {report.rhythm ? (
        <Rhythm rhythm={report.rhythm} />
      ) : (
        <Card title="Ритм работы">
          <p className="small muted">Слишком мало публичных коммитов для оценки ритма.</p>
        </Card>
      )}

      <Card
        title="Совместная работа"
        subtitle="Засчитывается только работа, проверенная другими людьми вне ваших организаций"
      >
        <div className="stack">
          <Numbers
            items={[
              ['PR всего', count(collaboration.pullRequestsTotal)],
              ['ревью всего', count(collaboration.reviewsTotal)],
              ['PR в независимые проекты', collaboration.externalPullRequests],
              ['из них принято', collaboration.externalMerged],
              ['доля принятых', share(collaboration.externalMergeRatePercent)],
              ['независимых репозиториев', collaboration.externalRepositories],
              ['своих организаций', collaboration.affiliatedOrganizations],
            ]}
          />
          {collaboration.notableContributions.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Вклад в заметные независимые проекты</caption>
                <thead>
                  <tr>
                    <th scope="col">Проект</th>
                    <th scope="col">Звёзды</th>
                    <th scope="col">Коммиты</th>
                    <th scope="col">Принятые PR</th>
                    <th scope="col">Ревью</th>
                  </tr>
                </thead>
                <tbody>
                  {collaboration.notableContributions.map((item) => (
                    <tr key={item.repository}>
                      <td>
                        <ExternalLink href={item.url}>{item.repository}</ExternalLink>
                      </td>
                      <td>{count(item.stars)}</td>
                      <td>{item.commits}</td>
                      <td>{item.mergedPullRequests}</td>
                      <td>{item.reviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title="Организации" subtitle="Публичное членство и организации, в чьи репозитории есть вклад">
        <div className="split-even">
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Публичное членство</strong>
            {report.organizations.memberships.length ? (
              <ul className={plainListClass}>
                {report.organizations.memberships.map((organization) => (
                  <li key={organization.login}>
                    <ExternalLink href={organization.url}>{organization.name ?? organization.login}</ExternalLink>{' '}
                    <span className="small muted">
                      · {organization.members} участников, {organization.publicRepositories} репозиториев
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">
                Публичных членств нет. GitHub по умолчанию скрывает членство в организациях.
              </p>
            )}
          </div>
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Вклад в организации</strong>
            {report.organizations.contributed.length ? (
              <ul className={plainListClass}>
                {report.organizations.contributed.map((organization) => (
                  <li key={organization.login}>
                    <ExternalLink href={organization.url}>{organization.login}</ExternalLink>{' '}
                    <span className="small muted">
                      · {organization.repositories} репоз., {count(organization.contributions)} вкладов
                    </span>{' '}
                    {organization.affiliated && (
                      <StatusChip tone="neutral" icon={null}>
                        своя
                      </StatusChip>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Вклада в репозитории организаций не найдено.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Языки и технологии" subtitle="Языки взвешены по вашему вкладу в каждый репозиторий">
        <div className="stack">
          <LanguageBar languages={report.languages} />
          {report.technologies.length > 0 ? (
            <ul className={plainListClass}>
              {report.technologies.map((technology) => (
                <li key={technology.skillId}>
                  <strong>{skillLabel(meta, technology.skillId)}</strong>{' '}
                  <span className="small muted">
                    · {technology.repositories}{' '}
                    {pluralRu(technology.repositories, 'репозиторий', 'репозитория', 'репозиториев')}:{' '}
                    {technology.signals.join('; ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Технологии каталога не найдены в публичных репозиториях.</p>
          )}
          <p className="small muted">
            Технология засчитывается только по артефакту: доле кода, зависимости в манифесте, Dockerfile или теме
            репозитория. Это свидетельство использования, а не подтверждённый навык.
          </p>
        </div>
      </Card>

      <Card title="Инженерная культура" subtitle={`Основные проекты: ${craft.substantiveRepositories}`}>
        <div className="stack">
          <Numbers
            items={[
              ['README', share(craft.readmePercent)],
              ['лицензия', share(craft.licensePercent)],
              ['CI', share(craft.ciPercent)],
              ['тесты', share(craft.testsPercent)],
              ['lock-файл', share(craft.lockfilePercent)],
              ['линтеры', share(craft.lintPercent)],
              ['содержательные коммиты', share(craft.descriptiveMessagesPercent)],
              ['Conventional Commits', share(craft.conventionalCommitsPercent)],
              ['подписанные коммиты', share(craft.signedCommitsPercent)],
              ['медианный коммит', craft.medianCommitLines === null ? '—' : `${craft.medianCommitLines} строк`],
            ]}
          />
          {report.repositories.length > 0 && (
            <TableWrap label="Проанализированные репозитории">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Репозиторий</th>
                    <th scope="col">Ваш вклад</th>
                    <th scope="col">Практики</th>
                  </tr>
                </thead>
                <tbody>
                  {report.repositories.map((repository) => (
                    <tr key={repository.nameWithOwner}>
                      <td>
                        <ExternalLink href={repository.url}>{repository.nameWithOwner}</ExternalLink>
                        <div className="small muted">
                          {repository.primaryLanguage ?? 'язык не указан'} · ★ {count(repository.stars)}
                          {repository.owned ? ' · ваш' : ''}
                          {repository.archived ? ' · в архиве' : ''}
                        </div>
                      </td>
                      <td>{count(repository.contributions)}</td>
                      <td>
                        {repository.hygiene.length ? (
                          <TagList items={repository.hygiene.map((signal) => hygieneLabel[signal])} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </Card>
    </div>
  );
}
