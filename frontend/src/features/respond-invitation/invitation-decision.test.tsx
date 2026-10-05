import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { candidateSession, invitation, problem, profile } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';
import { InvitationDecision } from './invitation-decision';

describe('invitation decision', () => {
  it('requires at least one disclosed field before acceptance', async () => {
    await renderWithProviders(<InvitationDecision invitation={invitation()} profile={profile()} />, {
      session: candidateSession,
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Имя и фамилия/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^Email/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/хотя бы одно поле/);
    expect((screen.getByRole('button', { name: 'Принять и открыть контакты' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('sends exactly the selected fields and waits for the server', async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${API}/api/v1/me/invitations/invitation-001/accept`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          invitation({ status: 'accepted', disclosureFields: ['email'], respondedAt: '2026-10-05T12:00:00.000Z' }),
        );
      }),
      http.get(`${API}/api/v1/me/invitations`, () => HttpResponse.json({ items: [] })),
      http.get(`${API}/api/v1/me/invitations/invitation-001`, () =>
        HttpResponse.json(invitation({ status: 'accepted', disclosureFields: ['email'] })),
      ),
    );
    await renderWithProviders(<InvitationDecision invitation={invitation()} profile={profile()} />, {
      session: candidateSession,
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Имя и фамилия/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Принять и открыть контакты' }));
    expect(sent).toEqual({ disclose: ['email'] });
  });

  it('shows a conflict and keeps contacts closed when another tab already decided', async () => {
    server.use(
      http.post(`${API}/api/v1/me/invitations/invitation-001/accept`, () => {
        const { body } = problem('invitation_terminal', 'Решение по приглашению уже принято', 409);
        return HttpResponse.json(body, { status: 409 });
      }),
      http.get(`${API}/api/v1/me/invitations`, () => HttpResponse.json({ items: [] })),
      http.get(`${API}/api/v1/me/invitations/invitation-001`, () =>
        HttpResponse.json(invitation({ status: 'declined' })),
      ),
    );
    await renderWithProviders(<InvitationDecision invitation={invitation()} profile={profile()} />, {
      session: candidateSession,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Принять и открыть контакты' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Статус уже изменился/);
  });

  it('offers no decision on a withdrawn invitation', async () => {
    await renderWithProviders(
      <InvitationDecision invitation={invitation({ status: 'withdrawn' })} profile={profile()} />,
      {
        session: candidateSession,
      },
    );
    expect(screen.getByText('Приглашение отозвано')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Принять и открыть контакты' })).toBeNull();
  });
});
