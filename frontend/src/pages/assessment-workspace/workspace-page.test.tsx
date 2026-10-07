import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { type AssessmentAnswer, assessmentKey } from '@/entities/assessment';
import { scopeOf } from '@/entities/session';
import { assessment, candidateSession, problem } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';
import { AssessmentWorkspacePage } from './workspace-page';

function renderWorkspace() {
  return renderWithProviders(<AssessmentWorkspacePage assessmentId="assessment-001" />, {
    session: candidateSession,
    prefill: (client) => client.setQueryData(assessmentKey(scopeOf(candidateSession), 'assessment-001'), assessment()),
  });
}

describe('assessment draft persistence', () => {
  it('serializes slow saves so an older response cannot overwrite the latest draft', async () => {
    const received: AssessmentAnswer[] = [];
    let releaseFirst: () => void = () => {};
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.put(`${API}/api/v1/me/assessments/assessment-001/answer`, async ({ request }) => {
        const answer = (await request.json()) as AssessmentAnswer;
        received.push(answer);
        if (received.length === 1) await firstResponse;
        return HttpResponse.json(assessment({ status: 'in_progress', answer, revision: received.length + 1 }));
      }),
    );
    await renderWorkspace();
    fireEvent.change(screen.getByLabelText('Код решения на Rust'), { target: { value: 'first draft' } });
    await waitFor(() => expect(received).toHaveLength(1), { timeout: 4000 });
    fireEvent.change(screen.getByLabelText('Код решения на Rust'), { target: { value: 'latest draft' } });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      expect(received).toHaveLength(1);
    } finally {
      releaseFirst();
    }
    await waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]?.code).toBe('latest draft');
    expect(await screen.findByText(/Черновик сохранён в/)).toBeTruthy();
  });

  it('reports a saved draft only after the server acknowledges it', async () => {
    let saved: AssessmentAnswer | null = null;
    server.use(
      http.put(`${API}/api/v1/me/assessments/assessment-001/answer`, async ({ request }) => {
        const answer = (await request.json()) as AssessmentAnswer;
        saved = answer;
        return HttpResponse.json(assessment({ status: 'in_progress', answer, revision: 2 }));
      }),
    );
    await renderWorkspace();
    fireEvent.change(screen.getByLabelText('Код решения на Rust'), { target: { value: 'fn solve() {}' } });
    expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy();
    expect(await screen.findByText(/Черновик сохранён в/, undefined, { timeout: 4000 })).toBeTruthy();
    expect(saved).toEqual({ code: 'fn solve() {}', explanation: '', externalAiUsed: false });
  });

  it('keeps the edit and says so when saving fails', async () => {
    server.use(
      http.put(`${API}/api/v1/me/assessments/assessment-001/answer`, () =>
        HttpResponse.json(problem('internal_error', 'Ошибка мок-сервера', 500).body, { status: 500 }),
      ),
    );
    await renderWorkspace();
    fireEvent.change(screen.getByLabelText('Код решения на Rust'), { target: { value: 'fn solve() {}' } });
    expect(await screen.findByText(/Черновик не сохранён/, undefined, { timeout: 4000 })).toBeTruthy();
    expect((screen.getByLabelText('Код решения на Rust') as HTMLTextAreaElement).value).toBe('fn solve() {}');
  });

  it('does not submit without an explanation', async () => {
    await renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Отправить решение' }));
    expect(screen.getByText(/Опишите решение перед отправкой/)).toBeTruthy();
  });
});
