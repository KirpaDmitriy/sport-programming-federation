import type { ReactNode } from 'react';
import { formatMinutes, formatOffset, type GitHubReport, hygieneLabel } from '@/entities/github-insights';
import { skillLabel, useMeta } from '@/entities/meta';
import { isDemoReference } from '@/entities/source';
import { formatDate, pluralRu } from '@/shared/lib';
import { Card, StatusChip, TableWrap, TagList } from '@/shared/ui';
import styles from './github-insights.module.css';
import {
  ActivityCalendar,
  Archetypes,
  DimensionList,
  Flags,
  HourChart,
  IndexSummary,
  LanguageBar,
  Numbers,
  plainListClass,
  StackGroups,
  WeekdayChart,
} from './parts';

const count = (value: number) => value.toLocaleString('ru-RU');
const share = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`);
const repositories = (value: number) => `${value} ${pluralRu(value, 'репозиторий', 'репозитория', 'репозиториев')}`;

/** Fixture links identify synthetic data and are not hosted pages. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (isDemoReference(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function Portrait({ report }: { report: GitHubReport }) {
  const { profile } = report;
  return (
    <Card title="Портрет разработчика" subtitle="По вашим собственным изменениям в публичных репозиториях">
      <div className="stack">
        <p style={{ margin: 0 }}>{profile.summary}</p>
        <Archetypes archetypes={profile.archetypes} />
        <div className="stack" style={{ gap: '0.5rem' }}>
          <strong className="small">Языки — по изменённым вами файлам</strong>
          <LanguageBar languages={report.languages} />
        </div>
        {profile.focusTopics.length > 0 && (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Темы проектов</strong>
            <TagList items={profile.focusTopics} label="Темы проектов" />
          </div>
        )}
        {profile.topProjects.length > 0 && (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <strong className="small">Главные проекты</strong>
            <ul className={styles.projects}>
              {profile.topProjects.map((project) => (
                <li key={project.nameWithOwner}>
                  <ExternalLink href={project.url}>{project.nameWithOwner}</ExternalLink>
                  {project.description && <span className="small">{project.description}</span>}
                  <span className="small muted">
                    {project.primaryLanguage ?? 'язык не указан'} · ★ {count(project.stars)} · ваших коммитов{' '}
                    {count(project.userCommits)} ({project.userSharePercent}% истории)
                    {project.lastCommitAt ? ` · последний ${formatDate(project.lastCommitAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Rhythm({ rhythm }: { rhythm: NonNullable<GitHubReport['rhythm']> }) {
  const sessions = rhythm.sessionsPerActiveDayTenths / 10;
  return (
    <Card title="Ритм работы" subtitle={`По ${count(rhythm.sampleSize)} коммитам, местное время автора`}>
      <div className="stack">
        <Numbers
          items={[
            ['время в активный день, медиана', formatMinutes(rhythm.medianMinutesPerActiveDay)],
            ['в напряжённые дни (90-й перцентиль)', formatMinutes(rhythm.p90MinutesPerActiveDay)],
            [
              'в активную неделю, медиана',
              rhythm.medianMinutesPerActiveWeek === null ? '—' : formatMinutes(rhythm.medianMinutesPerActiveWeek),
            ],
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
          Часовой пояс — из отметок времени самих коммитов:{' '}
          {rhythm.timezoneOffsets.map((item) => `${formatOffset(item.offsetMinutes)} (${item.percent}%)`).join(', ')}.
          Сессия — коммиты с перерывами не больше двух часов плюс 30 минут до первого коммита; сессия через полночь
          делится между днями. Это оценка по отметкам времени, а не учёт рабочего времени.
        </p>
      </div>
    </Card>
  );
}

/** The candidate's full report: exact values, names and links stay with the candidate. */
export function GitHubReportView({ report }: { report: GitHubReport }) {
  const meta = useMeta();
  const { activity, collaboration, craft, coverage, ownership } = report;
  return (
    <div className="stack-lg">
      <Card title="Индекс публичной активности GitHub" subtitle={`Алгоритм ${report.algorithmVersion}`}>
        <div className="stack">
          <IndexSummary index={report.index}>
            <span className="small">
              Регулярность, вовлечённость, собственные проекты, совместная работа и инженерная культура по публичным
              данным. Это не оценка навыков: грейд подтверждает только тест знаний.
            </span>
          </IndexSummary>
          <p className="small muted">
            Проанализировано {count(coverage.commitsAnalyzed)} ваших коммитов в{' '}
            {repositories(coverage.repositoriesAnalyzed)}. За год GitHub насчитывает{' '}
            {count(coverage.commitsLastYearTotal)} публичных коммитов
            {coverage.coveragePercent === null ? '' : `, в анализе — ${coverage.coveragePercent}% из них`}; всего за всё
            время — {count(coverage.commitsPublicTotal)}. Обновлено {formatDate(report.generatedAt)}
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

      <Portrait report={report} />

      <Card title="Из чего складывается индекс" subtitle="Пороговые правила, одинаковые для всех кандидатов">
        <DimensionList dimensions={report.dimensions} />
      </Card>

      <Card title="Активность" subtitle="Публичные коммиты и pull request’ы">
        <div className="stack">
          <Numbers
            items={[
              ['коммитов за год', count(activity.commitsLastYear)],
              ['PR за год', count(activity.pullRequestsLastYear)],
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
                  : `${activity.trendPercent > 0 ? '+' : ''}${count(activity.trendPercent)}%`,
              ],
            ]}
          />
          <ActivityCalendar days={activity.calendar} />
          <p className="small muted">
            Календарь и активные дни строятся по проанализированным репозиториям; коммиты по годам — по поиску GitHub во
            всех публичных репозиториях.
          </p>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Публичные коммиты по годам</caption>
              <thead>
                <tr>
                  <th scope="col">Год</th>
                  <th scope="col">Коммиты</th>
                  <th scope="col">Активных дней</th>
                </tr>
              </thead>
              <tbody>
                {activity.yearly.map((year) => (
                  <tr key={year.year}>
                    <td>{year.year}</td>
                    <td>{count(year.commits)}</td>
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

      <Card title="Собственные проекты и организации" subtitle="Проекты, которые вы ведёте, и ваши организации">
        <div className="stack">
          <Numbers
            items={[
              ['ведёте проектов', ownership.ledRepositories],
              ['из них с коммитами за год', ownership.maintainedRepositories],
              ['своих организаций', ownership.ownOrganizations],
              ['репозиториев в своих организациях', ownership.ownOrganizationRepositories],
              ['репозиториев с прямыми пушами', ownership.directPushRepositories],
            ]}
          />
          <div className="split-even">
            <div className="stack" style={{ gap: '0.5rem' }}>
              <strong className="small">Вклад в организации</strong>
              {report.organizations.contributed.length ? (
                <ul className={plainListClass}>
                  {report.organizations.contributed.map((organization) => (
                    <li key={organization.login}>
                      <ExternalLink href={organization.url}>{organization.login}</ExternalLink>{' '}
                      <span className="small muted">
                        · {repositories(organization.repositories)} в анализе, {count(organization.commits)} коммитов
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
            <div className="stack" style={{ gap: '0.5rem' }}>
              <strong className="small">Публичное членство</strong>
              {report.organizations.memberships.length ? (
                <ul className={plainListClass}>
                  {report.organizations.memberships.map((organization) => (
                    <li key={organization.login}>
                      <ExternalLink href={organization.url}>{organization.login}</ExternalLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">
                  Публичных членств нет: GitHub по умолчанию скрывает членство. Свои организации определяются по
                  коммитам, прямым пушам и принятию своих PR.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Совместная работа"
        subtitle="Засчитывается работа, принятая или проверенная другими людьми вне ваших организаций"
      >
        <div className="stack">
          <Numbers
            items={[
              ['PR всего', count(collaboration.pullRequestsTotal)],
              ['PR одобрено другими', count(collaboration.approvedPullRequests)],
              ['ревью чужих PR', count(collaboration.reviewsOfOthers)],
              ['ревью в независимых проектах', count(collaboration.independentReviews)],
              ['issues', count(collaboration.issuesTotal)],
              ['PR в независимые проекты', count(collaboration.externalPullRequests)],
              ['из них принято', count(collaboration.externalMerged)],
              ['доля принятых', share(collaboration.externalMergeRatePercent)],
              ['независимых репозиториев', collaboration.externalRepositories],
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
                    <th scope="col">Принятые PR</th>
                    <th scope="col">Коммиты в анализе</th>
                  </tr>
                </thead>
                <tbody>
                  {collaboration.notableContributions.map((item) => (
                    <tr key={item.repository}>
                      <td>
                        <ExternalLink href={item.url}>{item.repository}</ExternalLink>
                      </td>
                      <td>{count(item.stars)}</td>
                      <td>{item.mergedPullRequests}</td>
                      <td>{item.commits || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title="Технологии" subtitle="Из манифестов, файлов и истории проектов, где вы работаете">
        <div className="stack">
          <StackGroups stack={report.stack} />
          {report.technologies.length > 0 && (
            <details>
              <summary className="small">Навыки каталога с доказательствами</summary>
              <ul className={plainListClass}>
                {report.technologies.map((technology) => (
                  <li key={technology.skillId}>
                    <strong>{skillLabel(meta, technology.skillId)}</strong>{' '}
                    <span className="small muted">
                      · {repositories(technology.repositories)}: {technology.signals.join('; ')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="small muted">
            Технология засчитывается только по артефакту: зависимости в манифесте, файлу конфигурации или вашим
            изменениям кода. Это свидетельство использования, а не подтверждённый навык.
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
              ['обновление зависимостей', share(craft.dependencyUpdatesPercent)],
              ['контейнеры', share(craft.containerPercent)],
              ['содержательные коммиты', share(craft.descriptiveMessagesPercent)],
              ['Conventional Commits', share(craft.conventionalCommitsPercent)],
              [
                'файлов в коммите, медиана',
                craft.medianFilesPerCommit === null ? '—' : count(craft.medianFilesPerCommit),
              ],
              ['крупные коммиты', share(craft.largeCommitsPercent)],
              ['merge-коммиты', share(craft.mergeCommitsPercent)],
            ]}
          />
          {report.repositories.length > 0 && (
            <TableWrap label="Проанализированные репозитории">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Репозиторий</th>
                    <th scope="col">Ваши коммиты</th>
                    <th scope="col">Стек</th>
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
                          {repository.owned ? ' · ваш' : repository.led ? ' · ведёте' : ''}
                          {repository.archived ? ' · в архиве' : ''}
                        </div>
                      </td>
                      <td>
                        {count(repository.userCommits)}
                        <div className="small muted">
                          {repository.userSharePercent}% из {count(repository.totalCommits)}
                        </div>
                      </td>
                      <td>{repository.stack.length ? <TagList items={repository.stack} /> : '—'}</td>
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
