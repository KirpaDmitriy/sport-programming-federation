import { expect, type Page } from '@playwright/test';
import bank from '../../backend/crates/domain/data/knowledge-v1.json';

export async function answerKnowledgeTest(page: Page, correct = true) {
  await expect(page.getByRole('group').first()).toBeVisible();
  for (const question of bank.questions) {
    const group = page.getByRole('group', { name: new RegExp(question.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    if (!(await group.count())) continue;
    const option = question.options.find((o) =>
      correct ? o.id === question.correctOptionId : o.id !== question.correctOptionId,
    );
    if (!option) throw new Error('Invalid test bank');
    await group.getByRole('radio', { name: option.label, exact: true }).check();
  }
  await expect(page.getByText(/Черновик сохранён в/)).toBeVisible();
}
