import type { components } from '@/shared/api';

type S = components['schemas'];

export const gradeLabel: Record<S['Profile']['selectedGrade'], string> = {
  junior: 'Джуниор',
  middle: 'Мидл',
  senior: 'Сеньор',
};

export const specializationLabel: Record<S['Profile']['specialization'], string> = {
  backend: 'Бэкенд',
  frontend: 'Фронтенд',
  fullstack: 'Фулстек',
};

export const roleTitle: Record<S['Profile']['specialization'], string> = {
  backend: 'Бэкенд-разработчик',
  frontend: 'Фронтенд-разработчик',
  fullstack: 'Фулстек-разработчик',
};

export const industryLabel: Record<S['Profile']['industry'], string> = { it: 'Информационные технологии' };

export const workModeLabel: Record<S['Need']['workMode'], string> = {
  remote: 'Удалённо',
  hybrid: 'Гибрид',
  office: 'В офисе',
};

export const evidenceSourceLabel: Record<S['Evidence']['source'], string> = {
  github: 'GitHub',
  fsp: 'ФСП',
  assessment: 'Тест знаний',
};

export const criticalityLabel: Record<S['Requirement']['criticality'], string> = {
  required: 'Обязательно',
  desired: 'Желательно',
};

export const gradeOrder: S['Profile']['selectedGrade'][] = ['junior', 'middle', 'senior'];
export const specializationOrder: S['Profile']['specialization'][] = ['backend', 'frontend', 'fullstack'];
export const workModeOrder: S['Need']['workMode'][] = ['remote', 'hybrid', 'office'];
