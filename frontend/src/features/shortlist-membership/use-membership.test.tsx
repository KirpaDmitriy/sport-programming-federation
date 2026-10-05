import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { employerSession, problem, shortlist } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';
import { BookmarkButton } from './bookmark-button';
import { useShortlistMembership } from './use-membership';

function Harness({ candidateId, alias }: { candidateId: string; alias: string }) {
  const membership = useShortlistMembership('shortlist-001');
  const member = membership.isMember(candidateId);
  return (
    <>
      <span>Участников: {membership.shortlist.data?.members.length ?? '—'}</span>
      <BookmarkButton
        alias={alias}
        shortlistTitle={membership.shortlist.data?.title}
        member={member}
        pending={membership.toggle.isPending}
        onToggle={() => membership.toggle.mutate({ candidateId, alias, member })}
      />
      {membership.toggle.isError && <span>Ошибка сохранения</span>}
    </>
  );
}

describe('shortlist membership', () => {
  it('rolls back an optimistic add when the server rejects it', async () => {
    server.use(
      http.get(`${API}/api/v1/shortlists/shortlist-001`, () => HttpResponse.json(shortlist)),
      http.put(`${API}/api/v1/shortlists/shortlist-001/members/candidate024`, () => {
        const { status, body } = problem('internal_error', 'Ошибка мок-сервера', 500);
        return HttpResponse.json(body, { status });
      }),
      http.get(`${API}/api/v1/shortlists`, () => HttpResponse.json({ items: [] })),
    );
    await renderWithProviders(<Harness candidateId="candidate024" alias="Кандидат №024" />, {
      session: employerSession,
    });
    const button = await screen.findByRole('button', { name: /Добавить Кандидат №024/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(button);
    await screen.findByText('Ошибка сохранения');
    expect(screen.getByRole('button', { name: /Добавить Кандидат №024/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Участников: 1')).toBeTruthy();
  });

  it('reflects server-confirmed removal everywhere the membership is read', async () => {
    server.use(
      http.get(`${API}/api/v1/shortlists/shortlist-001`, () => HttpResponse.json(shortlist)),
      http.delete(`${API}/api/v1/shortlists/shortlist-001/members/candidate018`, () =>
        HttpResponse.json({ ...shortlist, count: 0, members: [] }),
      ),
      http.get(`${API}/api/v1/shortlists`, () => HttpResponse.json({ items: [] })),
    );
    await renderWithProviders(<Harness candidateId="candidate018" alias="Кандидат №018" />, {
      session: employerSession,
    });
    const button = await screen.findByRole('button', { name: /Удалить Кандидат №018/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText('Участников: 0')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Добавить Кандидат №018/ }).getAttribute('aria-pressed')).toBe('false');
  });
});
