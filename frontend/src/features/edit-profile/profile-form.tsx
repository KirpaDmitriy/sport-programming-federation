import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type SkillId, useMeta } from '@/entities/meta';
import { type Profile, type ProfilePatch, profileKey, updateProfile } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { describeError, fieldErrors } from '@/shared/api';
import { gradeLabel, gradeOrder, industryLabel, specializationLabel, specializationOrder } from '@/shared/lib';
import {
  Button,
  Callout,
  SelectField,
  TextareaField,
  TextField,
  ToggleGroup,
  TokenInput,
  UnsavedChangesGuard,
  useToast,
} from '@/shared/ui';

type Values = Required<Omit<ProfilePatch, 'consents'>>;

const valuesFrom = (profile: Profile): Values => ({
  name: profile.name,
  industry: profile.industry,
  specialization: profile.specialization,
  selectedGrade: profile.selectedGrade,
  stack: profile.stack,
  teamRole: profile.teamRole,
  experienceMonths: profile.experienceMonths,
  experience: profile.experience,
  softSkills: profile.softSkills,
});

const required = (message: string) => ({
  onSubmit: ({ value }: { value: string }) => (value.trim() ? undefined : message),
});

type Props = { profile: Profile; submitLabel: string; onSaved?: (profile: Profile) => void };

export function ProfileForm({ profile, submitLabel, onSaved }: Props) {
  const meta = useMeta();
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (values: Values) => updateProfile({ ...values, name: values.name.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey(scope), updated);
      form.reset(valuesFrom(updated));
      setServerErrors({});
      toast('Профиль сохранён');
      onSaved?.(updated);
    },
    onError: (error) => setServerErrors(fieldErrors(error)),
  });

  const form = useForm({
    defaultValues: valuesFrom(profile),
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
    onSubmitInvalid: () => {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    },
  });

  const errorFor = (name: keyof Values, clientErrors: unknown[]) =>
    (clientErrors[0] as string | undefined) ?? serverErrors[name];
  const clearServer = (name: keyof Values) =>
    setServerErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });

  return (
    <form
      className="stack-lg"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isDirty}>
        {(dirty) => <UnsavedChangesGuard when={dirty && !save.isPending} />}
      </form.Subscribe>
      <section className="stack" aria-labelledby="profile-basic">
        <h2 id="profile-basic" style={{ margin: 0, fontSize: '1.25rem' }}>
          Основные данные
        </h2>
        <form.Field name="name" validators={required('Укажите имя и фамилию')}>
          {(field) => (
            <TextField
              id="profile-name"
              label="Имя и фамилия"
              required
              maxLength={120}
              autoComplete="name"
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value);
                clearServer('name');
              }}
              onBlur={field.handleBlur}
              error={errorFor('name', field.state.meta.errors)}
            />
          )}
        </form.Field>
        <TextField
          id="profile-email"
          label="Email"
          value={profile.email}
          readOnly
          hint={
            profile.emailVerified
              ? 'Подтверждён. Адрес используется для входа и не меняется в анкете.'
              : 'Не подтверждён'
          }
        />
      </section>
      <hr className="divider" />
      <section className="stack" aria-labelledby="profile-professional">
        <h2 id="profile-professional" style={{ margin: 0, fontSize: '1.25rem' }}>
          Профессиональный профиль
        </h2>
        <div className="form-grid">
          <form.Field name="industry">
            {(field) => (
              <SelectField
                id="profile-industry"
                label="Отрасль"
                required
                value={field.state.value}
                onValueChange={field.handleChange}
                options={Object.entries(industryLabel).map(([value, label]) => ({
                  value: value as Values['industry'],
                  label,
                }))}
              />
            )}
          </form.Field>
          <form.Field name="specialization">
            {(field) => (
              <SelectField
                id="profile-specialization"
                label="Специализация"
                required
                value={field.state.value}
                onValueChange={(value) => {
                  field.handleChange(value);
                  clearServer('specialization');
                }}
                error={serverErrors.specialization}
                options={specializationOrder.map((value) => ({ value, label: specializationLabel[value] }))}
              />
            )}
          </form.Field>
          <form.Field name="selectedGrade">
            {(field) => (
              <SelectField
                id="profile-grade"
                label="Грейд для проверки"
                required
                hint="Выбранный грейд — цель следующей проверки. Подтверждённый грейд меняется только по её результату."
                value={field.state.value}
                onValueChange={field.handleChange}
                options={gradeOrder.map((value) => ({ value, label: gradeLabel[value] }))}
              />
            )}
          </form.Field>
          <form.Field name="experienceMonths">
            {(field) => (
              <TextField
                id="profile-months"
                label="Стаж, месяцев"
                inputMode="numeric"
                hint="0 — опыта нет; пустое поле — не указан"
                value={field.state.value === null ? '' : String(field.state.value)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '');
                  field.handleChange(digits === '' ? null : Math.min(1200, Number(digits)));
                  clearServer('experienceMonths');
                }}
                error={serverErrors.experienceMonths}
              />
            )}
          </form.Field>
          <div className="full">
            <form.Field
              name="stack"
              validators={{ onSubmit: ({ value }) => (value.length ? undefined : 'Выберите хотя бы одну технологию') }}
            >
              {(field) => (
                <ToggleGroup<SkillId>
                  id="profile-stack"
                  label="Стек"
                  hint="До пяти технологий из каталога платформы"
                  max={5}
                  options={meta.skills.map((skill) => ({ value: skill.id, label: skill.label }))}
                  selected={field.state.value}
                  onChange={(next) => {
                    field.handleChange(next);
                    clearServer('stack');
                  }}
                  error={errorFor('stack', field.state.meta.errors)}
                />
              )}
            </form.Field>
          </div>
          <div className="full">
            <form.Field name="experience" validators={required('Кратко опишите опыт')}>
              {(field) => (
                <TextareaField
                  id="profile-experience"
                  label="Опыт"
                  required
                  maxLength={4000}
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                    clearServer('experience');
                  }}
                  onBlur={field.handleBlur}
                  error={errorFor('experience', field.state.meta.errors)}
                />
              )}
            </form.Field>
          </div>
          <form.Field name="teamRole" validators={required('Укажите роль в команде')}>
            {(field) => (
              <TextField
                id="profile-role"
                label="Роль в команде"
                required
                maxLength={120}
                list="team-role-suggestions"
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  clearServer('teamRole');
                }}
                onBlur={field.handleBlur}
                error={errorFor('teamRole', field.state.meta.errors)}
              />
            )}
          </form.Field>
          <datalist id="team-role-suggestions">
            <option value="Разработчик" />
            <option value="Ведущий разработчик" />
            <option value="Тимлид" />
            <option value="Архитектор" />
          </datalist>
          <div className="full">
            <form.Field name="softSkills">
              {(field) => (
                <TokenInput
                  id="profile-soft"
                  label="Навыки общения"
                  aside="Самооценка"
                  hint="Например: «Командная работа». До 12 пунктов."
                  max={12}
                  maxLength={100}
                  values={field.state.value}
                  onChange={(next) => {
                    field.handleChange(next);
                    clearServer('softSkills');
                  }}
                  error={serverErrors.softSkills}
                />
              )}
            </form.Field>
          </div>
        </div>
      </section>
      {save.error && (
        <Callout tone="danger" role="alert" title="Профиль не сохранён">
          {describeError(save.error).message} Введённые данные остались в форме.
        </Callout>
      )}
      <form.Subscribe selector={(state) => state.isDirty}>
        {(dirty) => (
          <div className="row">
            <Button type="submit" variant="primary" pending={save.isPending} pendingLabel="Сохраняем…">
              {submitLabel}
            </Button>
            <Button
              disabled={!dirty || save.isPending}
              onClick={() => {
                form.reset(valuesFrom(profile));
                setServerErrors({});
                save.reset();
              }}
            >
              Отменить изменения
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
