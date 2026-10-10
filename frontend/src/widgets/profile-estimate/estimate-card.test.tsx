import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { type Profile, type ProfileEstimate, profileKey } from '@/entities/profile';
import { scopeOf } from '@/entities/session';
import estimates from '../../../../contracts/fixtures/profile-estimates.json' with { type: 'json' };
import { candidateSession, profile } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';
import { ProfileEstimateCard } from './estimate-card';

// The estimates are the Rust rules' serialized output for the shared fixtures.
const github = estimates.github as ProfileEstimate;

const estimated = (overrides: Partial<Profile> = {}): Profile =>
  profile({
    verifiedGrade: null,
    verifiedSpecialization: null,
    gradeConfirmedAt: null,
    estimate: {
      ...github,
      review: { specialization: 'backend', grade: 'middle', rationale: 'Мало ревью чужого кода.', agrees: false },
    },
    category: { specialization: 'backend', grade: 'senior', eligible: true, source: 'estimate', confidence: 'medium' },
    ...overrides,
  });

describe('profile estimate card', () => {
  it('explains the estimated category with every factor and the second opinion', async () => {
    await renderWithProviders(<ProfileEstimateCard profile={estimated()} canEstimate />, {
      session: candidateSession,
    });
    expect(screen.getByText('Бэкенд · Сеньор · оценка, средняя уверенность')).toBeTruthy();
    expect(screen.getByText(`Балл уровня ${github.score} из 100`)).toBeTruthy();
    for (const factor of github.factors) expect(screen.getByText(factor.label)).toBeTruthy();
    expect(screen.getByText(/Оценивает грейд как «Мидл», поэтому уверенность снижена/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Подтвердить тестом/ })).toBeTruthy();
  });

  it('asks for a source without an estimate and recalculates on request', async () => {
    const refreshed = estimated();
    server.use(http.post(`${API}/api/v1/me/profile/estimate`, () => HttpResponse.json(refreshed)));
    const { queryClient } = await renderWithProviders(
      <ProfileEstimateCard profile={profile({ estimate: null })} canEstimate />,
      { session: candidateSession },
    );
    expect(screen.getByText('Профиль ещё не оценён')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Оценить профиль' }));
    await waitFor(() => expect(queryClient.getQueryData(profileKey(scopeOf(candidateSession)))).toEqual(refreshed));
  });

  it('points to the sources when nothing is connected', async () => {
    await renderWithProviders(<ProfileEstimateCard profile={profile({ estimate: null })} canEstimate={false} />, {
      session: candidateSession,
    });
    expect(screen.getByText('Подключите GitHub или ФСП')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Подключить источники/ })).toBeTruthy();
  });
});
