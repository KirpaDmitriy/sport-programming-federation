import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { type AssessmentAnswer, assessmentKey } from '@/entities/assessment';
import { metaQueryOptions } from '@/entities/meta';
import { scopeOf } from '@/entities/session';
import { assessment, candidateSession, meta, problem } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';
import { AssessmentWorkspacePage } from './workspace-page';

function renderWorkspace() {
  return renderWithProviders(<AssessmentWorkspacePage assessmentId="assessment-001" />, {
    session: candidateSession,
    prefill: (client) => {
      client.setQueryData(metaQueryOptions().queryKey, meta);
      client.setQueryData(assessmentKey(scopeOf(candidateSession), 'assessment-001'), assessment());
    },
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
    fireEvent.click(screen.getByLabelText('Вариант A 1'));
    await waitFor(() => expect(received).toHaveLength(1), { timeout: 4000 });
    fireEvent.click(screen.getByLabelText('Вариант B 1'));
    try {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      expect(received).toHaveLength(1);
    } finally {
      releaseFirst();
    }
    await waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]?.responses).toEqual([{ questionId: 'q-0', optionId: 'b' }]);
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
    fireEvent.click(screen.getByLabelText('Вариант A 1'));
    expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy();
    expect(await screen.findByText(/Черновик сохранён в/, undefined, { timeout: 4000 })).toBeTruthy();
    expect(saved).toEqual({
      code: '',
      explanation: '',
      externalAiUsed: false,
      responses: [{ questionId: 'q-0', optionId: 'a' }],
    });
  });

  it('keeps the edit and says so when saving fails', async () => {
    server.use(
      http.put(`${API}/api/v1/me/assessments/assessment-001/answer`, () =>
        HttpResponse.json(problem('internal_error', 'Ошибка мок-сервера', 500).body, { status: 500 }),
      ),
    );
    await renderWorkspace();
    fireEvent.click(screen.getByLabelText('Вариант A 1'));
    expect(await screen.findByText(/Черновик не сохранён/, undefined, { timeout: 4000 })).toBeTruthy();
    expect((screen.getByLabelText('Вариант A 1') as HTMLInputElement).checked).toBe(true);
  });

  it('does not submit incomplete test answers', async () => {
    await renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }));
    expect(screen.getByText(/Выберите ответ на каждый вопрос/)).toBeTruthy();
  });
});

describe('assessment assistance', () => {
  it('keeps the question after failure and adds a real reply only after acknowledgement', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/api/v1/me/assessments/assessment-001/assistant`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(problem('bifrost_unavailable', 'Повторите позже', 502).body, { status: 502 })
          : HttpResponse.json({
              message: 'Проверьте откат транзакции',
              simulation: false,
              aiAllowed: true,
              externalAiAllowed: true,
            });
      }),
    );
    await renderWorkspace();
    const question = screen.getByLabelText('Вопрос по тесту') as HTMLTextAreaElement;
    fireEvent.change(question, { target: { value: 'Что произойдёт после ошибки?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Спросить' }));
    expect(await screen.findByText(/Помощник недоступен/)).toBeTruthy();
    expect(question.value).toBe('Что произойдёт после ошибки?');
    fireEvent.click(screen.getByRole('button', { name: 'Спросить' }));
    expect(await screen.findByText('Проверьте откат транзакции')).toBeTruthy();
    expect(question.value).toBe('');
    expect(screen.queryByText('Демонстрационный ответ')).toBeNull();
    expect(calls).toBe(2);
  });
});
