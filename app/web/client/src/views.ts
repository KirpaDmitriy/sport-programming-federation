import { loadCandidateDashboard } from './candidate.ts';
import { $$ } from './dom.ts';

export function switchView(view: string): void {
  for (const button of $$('.role-button')) button.classList.toggle('active', button.dataset.view === view);
  for (const element of $$('.view')) element.classList.toggle('active', element.id === `${view}-view`);
  if (view === 'candidate') loadCandidateDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function showAccountView(): void {
  for (const button of $$('.role-button')) button.classList.remove('active');
  for (const element of $$('.view')) element.classList.toggle('active', element.id === 'account-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
