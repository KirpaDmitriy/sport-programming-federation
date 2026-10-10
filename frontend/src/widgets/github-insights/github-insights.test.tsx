import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GitHubReport, GitHubSignal } from '@/entities/github-insights';
import { metaQueryOptions } from '@/entities/meta';
import report from '../../../../contracts/fixtures/github-report.json' with { type: 'json' };
import signal from '../../../../contracts/fixtures/github-signal.json' with { type: 'json' };
import { meta } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { AnalysisProgress } from './analysis-progress';
import { GitHubReportView } from './github-report';
import { GitHubSignalCard } from './github-signal-card';

// The fixtures are the Rust service's serialized output, validated against the contract by the mock suite.
const fullReport = report as GitHubReport;
const employerSignal = signal as GitHubSignal;

describe('GitHub insights', () => {
  it('shows the candidate the full report with its portrait, calendar, rhythm and repositories', async () => {
    await renderWithProviders(<GitHubReportView report={fullReport} />, {
      prefill: (client) => client.setQueryData(metaQueryOptions().queryKey, meta),
    });
    expect(screen.getByText(`Индекс ${fullReport.index.score} из 100`)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Портрет разработчика' })).toBeTruthy();
    expect(screen.getByText(fullReport.profile.summary)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Коммиты за год по дням/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ритм работы' })).toBeTruthy();
    expect(screen.getByText(/это оценка по\s+отметкам времени, а не учёт рабочего времени/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Собственные проекты и организации' })).toBeTruthy();
    const repositories = screen.getByRole('region', { name: 'Проанализированные репозитории' });
    expect(within(repositories).getByRole('link', { name: 'owner/project' }).getAttribute('href')).toBe(
      'https://github.com/owner/project',
    );
  });

  it('shows employers a rounded anonymous signal without names, links or a calendar', async () => {
    await renderWithProviders(<GitHubSignalCard signal={employerSignal} />);
    expect(screen.getByText('Владение аккаунтом подтверждено')).toBeTruthy();
    expect(screen.getByText(/не подтверждает\s+навыки и грейд/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Публичный вклад за год/ })).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(employerSignal.summary)).toBeTruthy();
    for (const hidden of ['owner/project', 'acme-labs', 'other/library'])
      expect(document.body.textContent).not.toContain(hidden);
  });

  it('shows the stage and progress of a running analysis', async () => {
    await renderWithProviders(
      <AnalysisProgress analysis={{ state: 'running', stage: 'Клонирование и разбор истории', progress: 42 }} />,
    );
    const progress = screen.getByRole('progressbar', { name: 'Анализ GitHub' });
    expect(progress.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText(/Клонирование и разбор истории · 42%/)).toBeTruthy();
  });
});
