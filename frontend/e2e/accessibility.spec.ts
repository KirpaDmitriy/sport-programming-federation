import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ALEXEY, COMPANY_A, resetMock, signIn } from './support';

const pages = {
  candidate: [
    '/candidate/overview',
    '/candidate/profile',
    '/candidate/sources',
    '/candidate/skills',
    '/candidate/assessments',
    '/candidate/vacancies',
    '/candidate/vacancies/need-002',
    '/candidate/applications',
    '/candidate/tasks',
  ],
  employer: [
    '/employer/needs',
    '/employer/applications',
    '/employer/tasks',
    '/employer/tasks?tab=responses',
    '/employer/needs/need-001',
    '/employer/candidates?needId=need-001&mode=recommended',
    '/employer/candidates/candidate024?needId=need-001',
  ],
};

async function audit(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  expect(blocking.map((item) => `${path}: ${item.id} (${item.nodes.length})`)).toEqual([]);
}

test('login page has no serious automated accessibility violations', async ({ page }) => {
  await resetMock('baseline');
  await audit(page, '/login');
});

test('candidate pages have no serious automated accessibility violations', async ({ page }) => {
  await resetMock('baseline');
  await signIn(page, ALEXEY, 'candidate');
  for (const path of pages.candidate) await audit(page, path);
});

test('employer pages have no serious automated accessibility violations', async ({ page }) => {
  await resetMock('qualified');
  await signIn(page, COMPANY_A, 'employer');
  for (const path of pages.employer) await audit(page, path);
});

test('keyboard users can skip to content and reach navigation', async ({ page }) => {
  await resetMock('baseline');
  await signIn(page, ALEXEY, 'candidate');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('narrow screens reflow without horizontal page scroll and keep navigation reachable', async ({ page }) => {
  await resetMock('baseline');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ALEXEY, 'candidate');
  for (const path of [
    '/candidate/overview',
    '/candidate/sources',
    '/candidate/profile',
    '/candidate/vacancies',
    '/candidate/vacancies/need-002',
    '/candidate/applications',
    '/candidate/tasks',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: 'Навыки' }).click();
  await page.waitForURL('**/candidate/skills');
});
