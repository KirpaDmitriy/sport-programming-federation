import { useId } from 'react';
import { type SkillId, skillLabel, useMeta } from '@/entities/meta';
import type { EvidencePolicy } from '@/entities/need';
import { Checkbox } from '@/shared/ui';

type Props = { policy: EvidencePolicy; onChange: (policy: EvidencePolicy) => void; skillId?: SkillId | '' };

/** Accepted evidence for one requirement; options come only from the contract and the competition catalog. */
export function PolicyEditor({ policy, onChange, skillId }: Props) {
  const meta = useMeta();
  const id = useId();
  const update = (patch: Partial<EvidencePolicy>) => onChange({ ...policy, ...patch });
  const competitions = [...meta.competitions].sort(
    (a, b) => Number(skillId ? b.skillIds.includes(skillId) : 0) - Number(skillId ? a.skillIds.includes(skillId) : 0),
  );
  return (
    <fieldset className="stack" style={{ margin: 0, padding: 0, border: 0 }}>
      <legend className="small" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Принимаемые подтверждения
      </legend>
      <Checkbox
        checked={policy.acceptAssessments}
        onChange={(event) => update({ acceptAssessments: event.target.checked })}
        label="Практические проверки платформы"
        description="Подтверждают навык на уровне пройденной проверки."
      />
      <Checkbox
        checked={policy.acceptGithub}
        onChange={(event) => update({ acceptGithub: event.target.checked })}
        label="Работа в GitHub"
        description="Наблюдения из открытых репозиториев: дают основания, но сами не подтверждают уровень."
      />
      <Checkbox
        checked={policy.acceptFsp}
        onChange={(event) => update({ acceptFsp: event.target.checked })}
        label="Соревнования ФСП"
        description="Записи каталога в этом стенде синтетические."
      />
      {policy.acceptFsp && (
        <div className="stack" style={{ paddingLeft: '2rem' }}>
          <label className="row small">
            <input
              type="radio"
              name={`${id}-selection`}
              checked={policy.competitionSelection === 'system'}
              onChange={() => update({ competitionSelection: 'system', competitionIds: [] })}
            />
            Любые подходящие соревнования из каталога
          </label>
          <label className="row small">
            <input
              type="radio"
              name={`${id}-selection`}
              checked={policy.competitionSelection === 'selected'}
              onChange={() => update({ competitionSelection: 'selected' })}
            />
            Только выбранные
          </label>
          {policy.competitionSelection === 'selected' && (
            <div className="stack" style={{ paddingLeft: '1.5rem' }}>
              {competitions.map((competition) => (
                <Checkbox
                  key={competition.id}
                  checked={policy.competitionIds.includes(competition.id)}
                  onChange={(event) =>
                    update({
                      competitionIds: event.target.checked
                        ? [...policy.competitionIds, competition.id]
                        : policy.competitionIds.filter((item) => item !== competition.id),
                    })
                  }
                  label={competition.name}
                  description={`${competition.discipline} · навыки: ${competition.skillIds
                    .map((skill) => skillLabel(meta, skill))
                    .join(', ')}${competition.synthetic ? ' · демонстрационная запись, не реальное событие' : ''}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
