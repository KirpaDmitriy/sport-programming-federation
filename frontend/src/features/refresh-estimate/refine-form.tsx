import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Profile, profileKey, updateProfile } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { describeError } from '@/shared/api';
import { Button, Callout, TextField, useToast } from '@/shared/ui';
import styles from './refine-form.module.css';

const digits = (value: string) => {
  const text = value.replace(/\D/g, '');
  return text === '' ? null : Number(text);
};

/**
 * The two answers evidence cannot give: total experience, private projects included, and a
 * leading role. Saving re-estimates at once; everything else stays automatic.
 */
export function RefineEstimateForm({ profile }: { profile: Profile }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const total = profile.experienceMonths;
  const [years, setYears] = useState(total === null ? '' : String(Math.floor(total / 12)));
  const [months, setMonths] = useState(total === null ? '' : String(total % 12));
  const typedRole = profile.autoFields.includes('teamRole') ? '' : profile.teamRole;
  const [role, setRole] = useState(typedRole);
  const yearsValue = digits(years);
  const monthsValue = digits(months);
  const experience =
    yearsValue === null && monthsValue === null
      ? null
      : Math.min(1200, (yearsValue ?? 0) * 12 + Math.min(11, monthsValue ?? 0));
  const changedExperience = experience !== total;
  const changedRole = role.trim() !== '' && role.trim() !== typedRole;
  const save = useMutation({
    mutationFn: () =>
      updateProfile({
        ...(changedExperience ? { experienceMonths: experience } : {}),
        ...(changedRole ? { teamRole: role.trim() } : {}),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey(scope), updated);
      toast('Оценка пересчитана');
    },
  });
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className={styles.lead}>
        <strong>Уточните два ответа</strong> — остальное система заполнит сама. Общий стаж учитывает закрытые проекты,
        которых не видно на GitHub; руководящая роль нужна для уровня «Лид».
      </p>
      <div className={styles.fields}>
        <TextField
          id="refine-years"
          label="Общий стаж, лет"
          inputMode="numeric"
          value={years}
          onChange={(event) => setYears(event.target.value.replace(/\D/g, ''))}
        />
        <TextField
          id="refine-months"
          label="Ещё месяцев"
          inputMode="numeric"
          value={months}
          onChange={(event) => setMonths(event.target.value.replace(/\D/g, ''))}
        />
        <div className={styles.role}>
          <TextField
            id="refine-role"
            label="Роль в команде"
            maxLength={120}
            placeholder="Например: тимлид"
            list="refine-role-suggestions"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          />
        </div>
        <datalist id="refine-role-suggestions">
          <option value="Разработчик" />
          <option value="Ведущий разработчик" />
          <option value="Тимлид" />
          <option value="Архитектор" />
          <option value="Руководитель направления" />
        </datalist>
      </div>
      <div className="row">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          pending={save.isPending}
          pendingLabel="Пересчитываем…"
          disabled={!profile.consents.processing || (!changedExperience && !changedRole)}
        >
          Пересчитать с уточнениями
        </Button>
      </div>
      {save.error && <Callout tone="danger">{describeError(save.error).message}</Callout>}
    </form>
  );
}
