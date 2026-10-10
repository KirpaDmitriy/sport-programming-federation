import type { components } from './generated/schema.d.ts';

type S = components['schemas'];

/** Behavior fixture for the development API; the Rust backend asks the insights service. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalizes `login`, `@login` or a profile URL the way the Rust domain does; null when invalid. */
export function parseGitHubLogin(input: string): string | null {
  let value = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  if (value.startsWith('github.com/')) {
    const segments = value.slice('github.com/'.length).split(/[?#]/)[0]?.split('/').filter(Boolean) ?? [];
    if (segments.length !== 1) return null;
    value = segments[0] ?? '';
  } else if (value.includes('/') || value.includes('.')) {
    return null;
  } else if (value.startsWith('@')) {
    value = value.slice(1);
  }
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value) ? value : null;
}

function metric(
  id: string,
  label: string,
  value: number,
  display: string,
  publicDisplay: string,
  score: number,
): S['GitHubMetric'] {
  return { id, label, value, display, publicDisplay, score };
}

export function githubFixtureReport(login: string, clock: string): S['GitHubReport'] {
  const today = Date.parse(clock.slice(0, 10));
  const calendar = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(today - (364 - index) * DAY_MS);
    const weekday = date.getUTCDay();
    const count = weekday === 0 || weekday === 6 ? (index % 9 === 0 ? 2 : 0) : (index * 7) % 5;
    return { date: date.toISOString().slice(0, 10), count };
  });
  const hourly = [0, 0, 0, 0, 0, 0, 0, 1, 3, 7, 11, 12, 8, 9, 11, 10, 9, 7, 4, 3, 2, 1, 1, 0];
  return {
    algorithmVersion: 'github-insights-v1',
    generatedAt: clock,
    login,
    profileUrl: `https://example.com/fixtures/github/${login}`,
    accountCreatedAt: '2019-03-14T10:00:00Z',
    coverage: {
      from: '2022-01-01T00:00:00Z',
      to: clock,
      yearsAnalyzed: 5,
      commitContributions: 1460,
      commitsSampled: 640,
      repositoriesAnalyzed: 9,
      timezoneSamples: 18,
      partial: false,
      notes: ['Демонстрационный отчёт: данные вымышленные.'],
    },
    index: { score: 63, band: 'strong', confidence: 'medium' },
    dimensions: [
      {
        id: 'consistency',
        label: 'Регулярность',
        score: 74,
        weight: 25,
        summary: 'Активность в основном регулярная',
        metrics: [
          metric('active_weeks', 'Активных недель за год', 41, '41 из 52', '≈40 из 52', 100),
          metric('longest_weekly_streak', 'Самая длинная серия активных недель', 17, '17 недель', '≈15 недель', 65),
        ],
      },
      {
        id: 'engagement',
        label: 'Вовлечённость',
        score: 68,
        weight: 20,
        summary: 'Заметная вовлечённость',
        metrics: [
          metric('active_days_last_year', 'Активных дней за год', 158, '158 дней', '≈160 дней', 88),
          metric('longest_daily_streak', 'Самая длинная серия дней подряд', 12, '12 дней', '≈10 дней', 40),
          metric('hours_per_active_day', 'Оценка времени в активный день (медиана)', 105, '1 ч 45 мин', '1,5–2 ч', 58),
        ],
      },
      {
        id: 'longevity',
        label: 'Стаж',
        score: 80,
        weight: 15,
        summary: 'Многолетняя устойчивая активность',
        metrics: [metric('active_years', 'Лет с публичным вкладом', 5, '5 лет', '5 лет', 100)],
      },
      {
        id: 'collaboration',
        label: 'Совместная работа',
        score: 46,
        weight: 20,
        summary: 'Совместная работа подтверждается слабо',
        metrics: [
          metric('peer_validated_pull_requests', 'PR, принятые или отревьюенные другим человеком', 9, '9', '9', 70),
          metric('reviews_of_others', 'Ревью в независимых репозиториях', 3, '3', '3', 35),
        ],
      },
      {
        id: 'craft',
        label: 'Инженерная культура',
        score: 61,
        weight: 15,
        summary: 'Хорошие инженерные практики в большинстве проектов',
        metrics: [
          metric('ci', 'Проекты с CI', 67, '67%', '≈65%', 67),
          metric('tests', 'Проекты с тестами', 56, '56%', '≈55%', 56),
        ],
      },
      {
        id: 'impact',
        label: 'Признание',
        score: 22,
        weight: 5,
        summary: 'Признание сообщества пока не видно',
        metrics: [metric('maintained_stars', 'Звёзды основных проектов', 34, '34', '≈35', 57)],
      },
    ],
    activity: {
      activeYears: 5,
      contributionsLastYear: calendar.reduce((sum, item) => sum + item.count, 0),
      privateContributionsLastYear: 120,
      activeDaysLastYear: calendar.filter((item) => item.count > 0).length,
      activeWeeksLastYear: 41,
      longestDailyStreak: 12,
      currentDailyStreak: 2,
      longestWeeklyStreak: 17,
      currentWeeklyStreak: 6,
      longestGapDaysLastYear: 9,
      lastActiveOn: clock.slice(0, 10),
      trendPercent: 12,
      calendar,
      yearly: [2022, 2023, 2024, 2025, 2026].map((year, index) => ({
        year,
        contributions: 180 + index * 70,
        commits: 140 + index * 55,
        pullRequests: 20 + index * 6,
        reviews: 6 + index * 3,
        issues: 4 + index,
        privateContributions: 20 * index,
        activeDays: 90 + index * 15,
      })),
    },
    rhythm: {
      sampleSize: 640,
      timezoneInferred: true,
      timezoneOffsets: [{ offsetMinutes: 180, percent: 100 }],
      hourlyPercent: hourly,
      weekdayPercent: [18, 19, 18, 17, 16, 7, 5],
      officeHoursPercent: 76,
      eveningPercent: 11,
      nightPercent: 0,
      weekendPercent: 12,
      activeDays: 214,
      medianMinutesPerActiveDay: 105,
      p90MinutesPerActiveDay: 290,
      sessionsPerActiveDayTenths: 16,
      longestSessionMinutes: 410,
    },
    collaboration: {
      pullRequestsTotal: 150,
      reviewsTotal: 51,
      issuesTotal: 30,
      pullRequestsSampled: 120,
      externalPullRequests: 14,
      externalMerged: 9,
      externalMergeRatePercent: 75,
      medianPullRequestLines: 86,
      externalRepositories: 6,
      organizationRepositories: 3,
      affiliatedOrganizations: 1,
      notableContributions: [
        {
          repository: 'demo-org/open-queue',
          url: 'https://example.com/fixtures/github/demo-org/open-queue',
          stars: 1800,
          commits: 6,
          mergedPullRequests: 4,
          reviews: 1,
        },
      ],
    },
    organizations: {
      memberships: [
        {
          login: 'demo-company',
          name: 'Демо Компания',
          url: 'https://example.com/fixtures/github/demo-company',
          members: 24,
          publicRepositories: 11,
        },
      ],
      contributed: [
        {
          login: 'demo-company',
          url: 'https://example.com/fixtures/github/demo-company',
          repositories: 3,
          contributions: 420,
          affiliated: true,
        },
        {
          login: 'demo-org',
          url: 'https://example.com/fixtures/github/demo-org',
          repositories: 1,
          contributions: 11,
          affiliated: false,
        },
      ],
    },
    languages: [
      { language: 'Rust', percent: 58 },
      { language: 'TypeScript', percent: 24 },
      { language: 'PLpgSQL', percent: 9 },
      { language: 'Shell', percent: 6 },
      { language: 'Dockerfile', percent: 3 },
    ],
    technologies: [
      { skillId: 'docker', repositories: 4, signals: ['файл Dockerfile', 'файл compose.yaml'], lastPushedAt: clock },
      { skillId: 'postgresql', repositories: 3, signals: ['Cargo.toml: sqlx', 'код на PL/pgSQL'], lastPushedAt: clock },
      { skillId: 'rust', repositories: 6, signals: ['Cargo.toml', 'Rust — 91% кода'], lastPushedAt: clock },
      { skillId: 'typescript', repositories: 2, signals: ['tsconfig.json'], lastPushedAt: clock },
    ],
    craft: {
      substantiveRepositories: 9,
      readmePercent: 100,
      licensePercent: 78,
      ciPercent: 67,
      testsPercent: 56,
      lockfilePercent: 89,
      lintPercent: 44,
      dependencyUpdatesPercent: 33,
      containerPercent: 44,
      conventionalCommitsPercent: 71,
      descriptiveMessagesPercent: 88,
      medianCommitLines: 42,
      largeCommitsPercent: 3,
      signedCommitsPercent: 0,
      mergeCommitsPercent: 6,
    },
    repositories: [
      {
        nameWithOwner: `${login}/order-api`,
        url: `https://example.com/fixtures/github/${login}/order-api`,
        owned: true,
        fork: false,
        archived: false,
        stars: 21,
        forks: 3,
        primaryLanguage: 'Rust',
        pushedAt: clock,
        contributions: 610,
        sampledCommits: 100,
        hygiene: ['readme', 'license', 'ci', 'tests', 'lockfile', 'lint', 'container', 'description'],
        technologies: ['docker', 'postgresql', 'rust'],
      },
      {
        nameWithOwner: 'demo-company/billing',
        url: 'https://example.com/fixtures/github/demo-company/billing',
        owned: false,
        fork: false,
        archived: false,
        stars: 4,
        forks: 0,
        primaryLanguage: 'TypeScript',
        pushedAt: clock,
        contributions: 320,
        sampledCommits: 100,
        hygiene: ['readme', 'ci', 'lockfile', 'description'],
        technologies: ['typescript'],
      },
    ],
    flags: [
      {
        id: 'mostly_private',
        severity: 'info',
        title: 'Основная работа — в приватных репозиториях',
        detail: 'Демонстрационный флаг: приватная работа не проверяется и не входит в индекс.',
      },
    ],
    highlights: [
      'Активность около 40 из 52 недель за последний год',
      'Самая длинная серия — ≈10 дней подряд',
      'Изменения, проверенные другими людьми: 9',
      'Основные языки: Rust, TypeScript',
    ],
  };
}

const round5 = (value: number) => Math.min(100, Math.floor((value + 2) / 5) * 5);

function hoursBand(minutes: number): string {
  if (minutes < 30) return 'менее 0,5 ч';
  const low = Math.floor(minutes / 30) * 30;
  const half = (value: number) => (value % 60 === 0 ? `${value / 60}` : `${Math.floor(value / 60)},5`);
  return `${half(low)}–${half(low + 30)} ч`;
}

/** The anonymous employer projection, mirroring `GitHubReport::employer_signal` in Rust. */
export function githubSignal(report: S['GitHubReport'], ownershipVerified: boolean): S['GitHubSignal'] {
  return {
    algorithmVersion: report.algorithmVersion,
    generatedAt: report.generatedAt.slice(0, 10),
    ownershipVerified,
    index: report.index,
    dimensions: report.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      score: dimension.score,
      summary: dimension.summary,
      metrics: dimension.metrics.map((item) => ({ id: item.id, label: item.label, display: item.publicDisplay })),
    })),
    languages: report.languages
      .slice(0, 5)
      .map((language) => ({ language: language.language, percent: round5(language.percent) }))
      .filter((language) => language.percent > 0),
    rhythm: report.rhythm && {
      hoursPerActiveDay: hoursBand(report.rhythm.medianMinutesPerActiveDay),
      officeHoursPercent: round5(report.rhythm.officeHoursPercent),
      weekendPercent: round5(report.rhythm.weekendPercent),
    },
    highlights: report.highlights,
    flags: report.flags.filter((flag) => flag.severity === 'warning'),
    mostlyPrivate: report.activity.privateContributionsLastYear > report.activity.contributionsLastYear / 2,
  };
}

/** The GitHub part of a source: a deterministic code, and the report when connected. */
export function githubSource(
  candidateId: string,
  report: S['GitHubReport'] | null,
  verifiedAt: string | null,
): S['GitHubSource'] {
  return {
    ownership: {
      verified: verifiedAt !== null,
      method: verifiedAt === null ? null : 'profile_code',
      verifiedAt,
      code: `fsp-demo${candidateId
        .replace(/[^a-z0-9]/gi, '')
        .slice(-6)
        .toLowerCase()}`,
    },
    report,
    employerPreview: report && githubSignal(report, verifiedAt !== null),
  };
}
