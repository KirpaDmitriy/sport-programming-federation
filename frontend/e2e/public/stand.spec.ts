import { readFile } from 'node:fs/promises';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { answerKnowledgeTest } from '../knowledge';

const code = process.env.FSP_DEMO_CODE ?? '123456';

async function signIn(page: Page, email: string, role: 'candidate' | 'employer') {
  await page.goto('/login');
  if (role === 'employer') await page.getByText('Работодатель', { exact: true }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByText('Код для этого стенда')).toBeVisible();
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL(new RegExp(`/${role}/`));
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
  return context.newPage();
}

test('HTTPS stand serves the app and deep links without mock controls', async ({ page, request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  expect(home.headers()['content-security-policy']).toContain("default-src 'self'");
  expect((await request.post('/__mock__/session', { data: { actor: 'candidate024' } })).status()).toBe(404);
  expect((await request.get('/__mock__/email-codes')).status()).toBe(404);
  expect((await request.get('/api/v1/meta')).status()).toBe(200);
  await page.goto('/employer/candidates?needId=need-001');
  await page.waitForURL(/\/login\?redirect=/);
  await expect(page.getByRole('heading', { name: 'Вход и регистрация' })).toBeVisible();
});

test('a new candidate and two companies complete the reverse-hiring flow', async ({ browser }) => {
  test.setTimeout(180_000);
  const candidate = await newPage(browser);
  await signIn(candidate, `stand-${Date.now()}@example.com`, 'candidate');
  await candidate.waitForURL('**/candidate/onboarding');
  await candidate.getByLabel('Согласен на обработку данных').click();
  await expect(candidate.getByLabel('Согласен на обработку данных')).toBeChecked();
  const publication = candidate.getByRole('switch', { name: 'Показывать профиль работодателям' });
  await publication.click();
  await expect(publication).toHaveAttribute('aria-checked', 'true');
  await candidate.getByLabel('Имя и фамилия').fill('Ирина Стендова');
  await candidate.getByLabel('Грейд для проверки').selectOption('junior');
  await candidate.getByRole('button', { name: 'Rust' }).click();
  await candidate.getByRole('textbox', { name: 'Опыт', exact: true }).fill('Проекты на Rust.');
  await candidate.getByLabel('Роль в команде').fill('Разработчик');
  await candidate.getByRole('button', { name: 'Сохранить анкету' }).click();
  await expect(candidate.getByText('Профиль сохранён')).toBeVisible();
  await candidate.getByRole('button', { name: 'Подтвердить уровень' }).click();
  await candidate.waitForURL(/\/workspace$/);
  await answerKnowledgeTest(candidate);
  await candidate.getByRole('button', { name: 'Отправить ответы' }).click();
  await candidate.getByRole('dialog').getByRole('button', { name: 'Отправить' }).click();
  await expect(candidate.getByRole('heading', { name: 'Джуниор подтверждён' })).toBeVisible();
  const profile = await (await candidate.request.get('/api/v1/me/profile')).json();
  const alias: string = profile.alias;
  const candidateId: string = profile.id;

  const downloadPromise = candidate.waitForEvent('download');
  await candidate.getByRole('button', { name: 'Скачать PDF' }).click();
  const download = await downloadPromise;
  expect((await readFile((await download.path()) as string)).subarray(0, 5).toString()).toBe('%PDF-');

  const companyA = await newPage(browser);
  await signIn(companyA, 'hr@sever-tech.example', 'employer');
  await companyA.goto(`/employer/candidates/${candidateId}?needId=need-001`);
  await expect(companyA.getByRole('heading', { name: alias })).toBeVisible();
  expect(await companyA.content()).not.toContain('Ирина');
  await companyA.getByRole('button', { name: 'Пригласить кандидата' }).click();
  await companyA.getByLabel('Описание предложения').fill('Приглашаем на стажировку в команду заказов.');
  await companyA.getByRole('dialog').getByRole('button', { name: 'Отправить приглашение' }).click();
  await expect(companyA.getByText(/Ждём решения кандидата/)).toBeVisible();

  await candidate.goto('/candidate/invitations');
  await candidate.getByRole('link', { name: /Север Тех/ }).click();
  await expect(candidate.getByText('До вычета налогов').first()).toBeVisible();
  await candidate.getByRole('button', { name: 'Принять и открыть контакты' }).click();
  await expect(candidate.getByRole('heading', { name: 'Вы приняли приглашение' })).toBeVisible();

  await companyA.reload();
  await expect(companyA.getByText('Ирина Стендова')).toBeVisible();
  const companyB = await newPage(browser);
  await signIn(companyB, 'hr@second-company.example', 'employer');
  const disclosure = await (await companyB.request.get(`/api/v1/candidates/${candidateId}/disclosure`)).json();
  expect(disclosure).toMatchObject({ granted: false, fields: {} });
  await companyB.goto(`/employer/candidates/${candidateId}`);
  await expect(companyB.getByRole('heading', { name: alias })).toBeVisible();
  expect(await companyB.content()).not.toContain('Ирина');
});
