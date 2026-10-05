import { expect, test } from '@playwright/test';
import { ALEXEY, advanceClock, latestCode, requestCode, resetMock, signIn } from './support';

test.beforeEach(() => resetMock('baseline'));

test('UI-01 a new candidate verifies email; a wrong code is recoverable', async ({ page }) => {
  const email = `new-${Date.now()}@example.com`;
  await requestCode(page, email, 'candidate');
  await expect(page.getByText('Демонстрационная почта')).toBeVisible();
  await page.getByLabel('Код из письма').fill('000000');
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await expect(page.getByText(/Неверный код/)).toBeVisible();
  await page.getByLabel('Код из письма').fill(await latestCode(email));
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL('**/candidate/onboarding');
  await expect(page.getByRole('heading', { name: 'Анкета кандидата' })).toBeVisible();
  await expect(page.getByText('Уровень ещё не подтверждён')).toHaveCount(0);
});

test('UI-01 an expired code is rejected by the server and a new code works', async ({ page }) => {
  await requestCode(page, ALEXEY, 'candidate');
  const code = await latestCode(ALEXEY);
  await advanceClock(16 * 60);
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await expect(page.getByText('Срок действия кода истёк. Запросите новый код.')).toBeVisible();
  await page.getByRole('button', { name: 'Отправить новый код' }).click();
  await expect(page.getByText(/Срок действия кода истёк/)).toHaveCount(0);
  await page.getByLabel('Код из письма').fill(await latestCode(ALEXEY));
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL('**/candidate/overview');
});

test('UI-25 roles are separated and deep links return after sign-in', async ({ page }) => {
  await page.goto('/candidate/skills?view=graph');
  await page.waitForURL(/\/login\?redirect=/);
  await page.getByLabel('Электронная почта').fill(ALEXEY);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await page.getByLabel('Код из письма').fill(await latestCode(ALEXEY));
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL('**/candidate/skills?view=graph');
  await page.goto('/employer/needs');
  await expect(page.getByRole('heading', { name: 'Раздел недоступен' })).toBeVisible();
  const forbidden = await page.request.get('/api/v1/candidates');
  expect(forbidden.status()).toBe(403);
});

test('UI-25 an expired session clears private data and asks to sign in again', async ({ page, context }) => {
  await signIn(page, ALEXEY, 'candidate');
  await expect(page.getByRole('heading', { name: 'Алексей Морозов' })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('link', { name: 'Профиль' }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByText('Сессия завершилась')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Алексей Морозов' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Аккаунт:/ })).toHaveCount(0);
});

test('UI-25 logout ends the session', async ({ page }) => {
  await signIn(page, ALEXEY, 'candidate');
  await page.getByRole('button', { name: /Аккаунт:/ }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.waitForURL('**/login');
  await page.goto('/candidate/overview');
  await page.waitForURL(/\/login\?redirect=/);
});
