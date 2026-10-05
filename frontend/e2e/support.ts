import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:4010';
export type Scenario =
  | 'baseline'
  | 'qualified'
  | 'assessment_failure'
  | 'service_failure'
  | 'no_fsp'
  | 'empty_bank'
  | 'api_error'
  | 'new_candidate';

async function mockPost(path: string, body: unknown) {
  const response = await fetch(`${MOCK}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

export const resetMock = (scenario: Scenario = 'baseline') => mockPost('/__mock__/reset', { scenario });
export const advanceClock = (advanceSeconds: number) => mockPost('/__mock__/clock', { advanceSeconds });

export async function latestCode(email: string) {
  const response = await fetch(`${MOCK}/__mock__/email-codes`);
  const { items } = (await response.json()) as { items: Array<{ email: string; code: string; used: boolean }> };
  const entry = items.filter((item) => item.email === email.toLowerCase() && !item.used).at(-1);
  if (!entry) throw new Error(`No code for ${email}`);
  return entry.code;
}

export async function requestCode(page: Page, email: string, role: 'candidate' | 'employer') {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Вход и регистрация' })).toBeVisible();
  if (role === 'employer') await page.getByText('Работодатель', { exact: true }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByLabel('Код из письма')).toBeVisible();
}

export async function signIn(page: Page, email: string, role: 'candidate' | 'employer') {
  await requestCode(page, email, role);
  await page.getByLabel('Код из письма').fill(await latestCode(email));
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await page.waitForURL(new RegExp(`/${role}/`));
}

export async function actor(browser: Browser, email: string, role: 'candidate' | 'employer') {
  const context: BrowserContext = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signIn(page, email, role);
  return { context, page };
}

export const ALEXEY = 'alexey@example.com';
export const COMPANY_A = 'hr@sever-tech.example';
export const COMPANY_B = 'hr@second-company.example';
export const PRIVATE_MARKERS = ['Алексей', 'Морозов', 'alexey@', 'order-api', 'PR #17', 'example.com/fixtures'];

/** Collects every API response body an employer page receives, to assert that private data never arrives. */
export function recordApiBodies(page: Page) {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/') || response.url().includes('/disclosure')) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Navigation can discard a body before it is read.
    }
  });
  return bodies;
}
