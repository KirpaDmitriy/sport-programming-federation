import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GitHubReport, GitHubSignal } from '@/entities/github-insights';
import { metaQueryOptions } from '@/entities/meta';
import report from '../../../../contracts/fixtures/github-report.json' with { type: 'json' };
import signal from '../../../../contracts/fixtures/github-signal.json' with { type: 'json' };
import { meta } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { GitHubReportView } from './github-report';
import { GitHubSignalCard } from './github-signal-card';

// The fixtures are the Rust service's serialized output, validated against the contract by the mock suite.
const fullReport = report as GitHubReport;
const employerSignal = signal as GitHubSignal;

describe('GitHub insights', () => {
  it('shows the candidate the full report with its calendar, rhythm and repositories', async () => {
    await renderWithProviders(<GitHubReportView report={fullReport} />, {
      prefill: (client) => client.setQueryData(metaQueryOptions().queryKey, meta),
    });
    expect(screen.getByText(`Индекс ${fullReport.index.score} из 100`)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Публичный вклад за год/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ритм работы' })).toBeTruthy();
    expect(screen.getByText(/это оценка по\s+отметкам времени, а не учёт рабочего времени/i)).toBeTruthy();
    const repositories = screen.getByRole('region', { name: 'Проанализированные репозитории' });
    expect(within(repositories).getByRole('link', { name: 'dev/service' }).getAttribute('href')).toBe(
      'https://github.com/dev/service',
    );
  });

  it('shows employers a rounded anonymous signal without names, links or a calendar', async () => {
    await renderWithProviders(<GitHubSignalCard signal={employerSignal} />);
    expect(screen.getByText('Владение аккаунтом подтверждено')).toBeTruthy();
    expect(screen.getByText(/не подтверждает\s+навыки и грейд/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Публичный вклад за год/ })).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('dev/service');
  });
});
