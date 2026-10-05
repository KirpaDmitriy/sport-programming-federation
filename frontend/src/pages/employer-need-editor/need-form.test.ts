import { describe, expect, it } from 'vitest';
import { defaultEvidencePolicy } from '@/entities/need';
import { emptyRequirement, parseRubles, requirementsError, salaryRangeError, toNeedInput } from './need-form';

const requirement = (skillId: 'rust' | 'postgresql' | 'docker', criticality: 'required' | 'desired' = 'required') => ({
  ...emptyRequirement(defaultEvidencePolicy(), 'middle'),
  skillId,
  criticality,
});

describe('salary input', () => {
  it('accepts whole rubles with space separators', () => {
    expect(parseRubles('200 000')).toEqual({ value: 200000 });
    expect(parseRubles('260000')).toEqual({ value: 260000 });
  });

  it.each(['', '200000.5', '-1', '1e6', 'abc', '200 000 ₽'])('rejects %j', (raw) => {
    expect(parseRubles(raw)).toHaveProperty('error');
  });

  it('rejects zero and absurd amounts', () => {
    expect(parseRubles('0')).toEqual({ error: 'Сумма должна быть больше нуля' });
    expect(parseRubles('100000001')).toEqual({ error: 'Слишком большая сумма' });
  });

  it('reports a reversed range on the upper bound', () => {
    expect(salaryRangeError('260000', '200000')).toBe('Максимум не может быть меньше минимума');
    expect(salaryRangeError('200000', '200000')).toBeUndefined();
  });
});

describe('requirements', () => {
  it('needs a skill in every row, unique skills and one required item', () => {
    expect(requirementsError([])).toMatch(/хотя бы одно/);
    expect(requirementsError([emptyRequirement(defaultEvidencePolicy(), 'middle')])).toMatch(/Выберите навык/);
    expect(requirementsError([requirement('rust'), requirement('rust')])).toMatch(/только один раз/);
    expect(requirementsError([requirement('docker', 'desired')])).toMatch(/обязательное/);
    expect(requirementsError([requirement('rust'), requirement('docker', 'desired')])).toBeUndefined();
  });

  it('requires at least one accepted source and explicit competitions when selected', () => {
    const none = {
      ...requirement('rust'),
      evidencePolicy: { ...defaultEvidencePolicy(), acceptAssessments: false, acceptGithub: false, acceptFsp: false },
    };
    expect(requirementsError([none])).toMatch(/источник/);
    const selected = {
      ...requirement('rust'),
      evidencePolicy: { ...defaultEvidencePolicy(), competitionSelection: 'selected' as const },
    };
    expect(requirementsError([selected])).toMatch(/соревнования/);
  });
});

describe('need payload', () => {
  it('fixes currency, period and gross basis and clears competitions for system selection', () => {
    const input = toNeedInput({
      title: ' Бэкенд-разработчик ',
      specialization: 'backend',
      grade: 'middle',
      workMode: 'remote',
      salaryFrom: '200 000',
      salaryTo: '260 000',
      description: 'API',
      requirements: [
        {
          ...requirement('rust'),
          evidencePolicy: {
            ...defaultEvidencePolicy(),
            competitionSelection: 'system',
            competitionIds: ['competition-demo-api'],
          },
        },
      ],
    });
    expect(input.title).toBe('Бэкенд-разработчик');
    expect(input.salary).toEqual({ from: 200000, to: 260000, currency: 'RUB', period: 'month', taxBasis: 'gross' });
    expect(input.requirements[0]?.evidencePolicy.competitionIds).toEqual([]);
  });
});
