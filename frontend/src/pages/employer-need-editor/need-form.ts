import type { SkillId } from '@/entities/meta';
import { defaultEvidencePolicy, type EvidencePolicy, type Need, type NeedInput } from '@/entities/need';

export type RequirementForm = {
  key: string;
  skillId: SkillId | '';
  criticality: 'required' | 'desired';
  minimumGrade: Need['grade'];
  evidencePolicy: EvidencePolicy;
};

export type NeedFormValues = {
  title: string;
  specialization: Need['specialization'];
  grade: Need['grade'];
  workMode: Need['workMode'];
  salaryFrom: string;
  salaryTo: string;
  description: string;
  requirements: RequirementForm[];
};

const MAX_SALARY = 100_000_000;
let keySeed = 0;
export const requirementKey = () => `requirement-${++keySeed}`;

export function emptyRequirement(policy: EvidencePolicy, grade: Need['grade']): RequirementForm {
  return {
    key: requirementKey(),
    skillId: '',
    criticality: 'required',
    minimumGrade: grade,
    evidencePolicy: structuredClone(policy),
  };
}

export function formFromNeed(need: Need | undefined): NeedFormValues {
  if (!need) {
    return {
      title: '',
      specialization: 'backend',
      grade: 'middle',
      workMode: 'remote',
      salaryFrom: '',
      salaryTo: '',
      description: '',
      requirements: [emptyRequirement(defaultEvidencePolicy(), 'middle')],
    };
  }
  return {
    title: need.title,
    specialization: need.specialization,
    grade: need.grade,
    workMode: need.workMode,
    salaryFrom: String(need.salary.from),
    salaryTo: String(need.salary.to),
    description: need.description,
    requirements: need.requirements.map((item) => ({
      key: requirementKey(),
      skillId: item.skillId,
      criticality: item.criticality,
      minimumGrade: item.minimumGrade,
      evidencePolicy: structuredClone(item.evidencePolicy),
    })),
  };
}

/** Parses a whole-ruble amount; spaces are allowed as thousands separators, anything else is rejected. */
export function parseRubles(raw: string): { value: number } | { error: string } {
  const compact = raw.replace(/[\s ]/g, '');
  if (!compact) return { error: 'Укажите сумму' };
  if (!/^\d+$/.test(compact)) return { error: 'Введите целое положительное число рублей без копеек' };
  const value = Number(compact);
  if (value <= 0) return { error: 'Сумма должна быть больше нуля' };
  if (value > MAX_SALARY) return { error: 'Слишком большая сумма' };
  return { value };
}

export function rublesError(raw: string) {
  const parsed = parseRubles(raw);
  return 'error' in parsed ? parsed.error : undefined;
}

export function salaryRangeError(from: string, to: string) {
  const min = parseRubles(from);
  const max = parseRubles(to);
  if ('value' in min && 'value' in max && min.value > max.value) return 'Максимум не может быть меньше минимума';
  return undefined;
}

export function requirementsError(requirements: RequirementForm[]) {
  if (requirements.length === 0) return 'Добавьте хотя бы одно требование';
  if (requirements.some((item) => !item.skillId)) return 'Выберите навык в каждой строке';
  const ids = requirements.map((item) => item.skillId);
  if (new Set(ids).size !== ids.length) return 'Каждый навык можно указать только один раз';
  if (!requirements.some((item) => item.criticality === 'required'))
    return 'Отметьте хотя бы одно требование как обязательное';
  for (const item of requirements) {
    const policy = item.evidencePolicy;
    if (!policy.acceptAssessments && !policy.acceptGithub && !policy.acceptFsp) {
      return 'В каждом требовании выберите хотя бы один принимаемый источник подтверждения';
    }
    if (policy.acceptFsp && policy.competitionSelection === 'selected' && policy.competitionIds.length === 0) {
      return 'Отметьте соревнования, которые принимаете, или выберите «любые из каталога»';
    }
  }
  return undefined;
}

export function toNeedInput(values: NeedFormValues): NeedInput {
  const from = parseRubles(values.salaryFrom);
  const to = parseRubles(values.salaryTo);
  if (!('value' in from) || !('value' in to)) throw new Error('Salary must be validated before submission');
  return {
    title: values.title.trim(),
    specialization: values.specialization,
    grade: values.grade,
    workMode: values.workMode,
    salary: { from: from.value, to: to.value, currency: 'RUB', period: 'month', taxBasis: 'gross' },
    description: values.description.trim(),
    requirements: values.requirements.map((item) => ({
      skillId: item.skillId as SkillId,
      criticality: item.criticality,
      minimumGrade: item.minimumGrade,
      evidencePolicy: {
        ...item.evidencePolicy,
        competitionIds:
          item.evidencePolicy.competitionSelection === 'selected' ? item.evidencePolicy.competitionIds : [],
      },
    })),
  };
}
