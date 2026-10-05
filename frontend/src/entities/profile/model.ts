import { queryOptions } from '@tanstack/react-query';
import { api, type components, requireData, type Scope } from '@/shared/api';

export type Profile = components['schemas']['Profile'];
export type ProfilePatch = components['schemas']['ProfilePatch'];
export type Onboarding = components['schemas']['Onboarding'];
export type Eligibility = components['schemas']['GradeEligibility'];

export const profileKey = (scope: Scope) => [...scope, 'profile'] as const;

export const profileQuery = (scope: Scope) =>
  queryOptions({
    queryKey: profileKey(scope),
    queryFn: async ({ signal }) => requireData(await api.GET('/api/v1/me/profile', { signal })),
  });

export async function updateProfile(patch: ProfilePatch) {
  return requireData(await api.PATCH('/api/v1/me/profile', { body: patch }));
}

export const blockerLabel: Record<Onboarding['blockers'][number], string> = {
  email: 'почта не подтверждена',
  questionnaire: 'анкета не заполнена',
  assessment: 'уровень не подтверждён проверкой',
  processing_consent: 'нет согласия на обработку данных',
  publication_consent: 'показ профиля работодателям выключен',
};

export const eligibilityReasonText: Record<NonNullable<Eligibility['selectedReason']>, string> = {
  cooldown: 'Подтверждённый грейд недавно менялся. Новую смену грейда можно начать после указанной даты.',
  onboarding_incomplete: 'Сначала подтвердите почту, заполните анкету и дайте согласие на обработку данных.',
  active_assessment: 'У вас есть незавершённая проверка. Продолжите её.',
  unsupported_scope: 'Практические задания пока подготовлены только для бэкенда. Выберите специализацию «Бэкенд».',
  grade_downgrade: 'Проверка ниже подтверждённого грейда не проводится: подтверждённый грейд не понижается.',
};
