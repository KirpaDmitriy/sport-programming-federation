import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type Company, companyInitials, companyKey, companyQuery, updateCompany } from '@/entities/company';
import { useScope } from '@/entities/session';
import { describeError, fieldErrors } from '@/shared/api';
import { useDocumentTitle } from '@/shared/lib';
import {
  Avatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  PageHeader,
  StatusChip,
  TextareaField,
  TextField,
  UnsavedChangesGuard,
  useToast,
} from '@/shared/ui';

type Values = { displayName: string; businessArea: string; description: string; contactEmail: string; website: string };

const valuesFrom = (company: Company): Values => ({
  displayName: company.displayName,
  businessArea: company.businessArea,
  description: company.description,
  contactEmail: company.contactEmail,
  website: company.website ?? '',
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const required = (message: string) => ({
  onSubmit: ({ value }: { value: string }) => (value.trim() ? undefined : message),
});

export function EmployerCompanyPage() {
  useDocumentTitle('Профиль компании');
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: company } = useSuspenseQuery(companyQuery(scope));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (values: Values) =>
      updateCompany({
        displayName: values.displayName.trim(),
        businessArea: values.businessArea.trim(),
        description: values.description.trim(),
        contactEmail: values.contactEmail.trim(),
        website: values.website.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(companyKey(scope), updated);
      form.reset(valuesFrom(updated));
      setServerErrors({});
      toast('Профиль компании сохранён');
    },
    onError: (error) => setServerErrors(fieldErrors(error)),
  });

  const form = useForm({
    defaultValues: valuesFrom(company),
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
    onSubmitInvalid: () =>
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()),
  });

  const field = (name: keyof Values, errors: unknown[]) => (errors[0] as string | undefined) ?? serverErrors[name];

  return (
    <>
      <PageHeader
        title="Профиль компании"
        subtitle="Кандидат увидит эти сведения и контакт в приглашении до своего решения"
      />
      {!company.readyToInvite && (
        <Callout tone="warning" title="Заполните профиль, чтобы отправлять приглашения">
          Нужны название, сфера деятельности, описание и контактная почта. Потребности и поиск кандидатов доступны и без
          этого.
        </Callout>
      )}
      <div className="split" style={{ marginTop: '1.5rem' }}>
        <Card>
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
            <div className="form-grid">
              <form.Field name="displayName" validators={required('Укажите название компании')}>
                {(f) => (
                  <TextField
                    id="company-name"
                    label="Название"
                    required
                    maxLength={120}
                    value={f.state.value}
                    onChange={(event) => f.handleChange(event.target.value)}
                    error={field('displayName', f.state.meta.errors)}
                  />
                )}
              </form.Field>
              <form.Field name="businessArea" validators={required('Укажите сферу деятельности')}>
                {(f) => (
                  <TextField
                    id="company-area"
                    label="Сфера деятельности"
                    required
                    maxLength={200}
                    value={f.state.value}
                    onChange={(event) => f.handleChange(event.target.value)}
                    error={field('businessArea', f.state.meta.errors)}
                  />
                )}
              </form.Field>
              <div className="full">
                <form.Field name="description" validators={required('Опишите компанию')}>
                  {(f) => (
                    <TextareaField
                      id="company-description"
                      label="Описание"
                      required
                      maxLength={4000}
                      value={f.state.value}
                      onChange={(event) => f.handleChange(event.target.value)}
                      error={field('description', f.state.meta.errors)}
                    />
                  )}
                </form.Field>
              </div>
              <form.Field
                name="contactEmail"
                validators={{
                  onSubmit: ({ value }) =>
                    !value.trim()
                      ? 'Укажите контактную почту'
                      : !emailPattern.test(value.trim())
                        ? 'Проверьте адрес почты'
                        : undefined,
                }}
              >
                {(f) => (
                  <TextField
                    id="company-email"
                    label="Контактная почта для кандидатов"
                    type="email"
                    required
                    hint="Видна кандидату в приглашении до принятия"
                    value={f.state.value}
                    onChange={(event) => f.handleChange(event.target.value)}
                    error={field('contactEmail', f.state.meta.errors)}
                  />
                )}
              </form.Field>
              <form.Field
                name="website"
                validators={{
                  onSubmit: ({ value }) =>
                    value.trim() && !/^https?:\/\/\S+$/.test(value.trim())
                      ? 'Адрес сайта должен начинаться с https://'
                      : undefined,
                }}
              >
                {(f) => (
                  <TextField
                    id="company-site"
                    label="Сайт"
                    type="url"
                    hint="Необязательно"
                    value={f.state.value}
                    onChange={(event) => f.handleChange(event.target.value)}
                    error={field('website', f.state.meta.errors)}
                  />
                )}
              </form.Field>
            </div>
            {save.error && (
              <Callout tone="danger" role="alert" title="Профиль не сохранён">
                {describeError(save.error).message}
              </Callout>
            )}
            <div className="row">
              <Button type="submit" variant="primary" pending={save.isPending} pendingLabel="Сохраняем…">
                Сохранить профиль
              </Button>
              <Button onClick={() => form.reset(valuesFrom(company))} disabled={save.isPending}>
                Отменить изменения
              </Button>
            </div>
          </form>
        </Card>
        <Card title="Как видит кандидат">
          <div className="stack">
            <div className="row">
              <Avatar kind="company" text={companyInitials(company)} size="md" />
              <div>
                <strong>{company.displayName || 'Название не указано'}</strong>
                <div className="small muted">{company.businessArea || 'Сфера не указана'}</div>
              </div>
            </div>
            <p className="small">{company.description || 'Описание не заполнено.'}</p>
            <p className="small">
              Контакт: <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
            </p>
            {company.readyToInvite ? (
              <StatusChip tone="success">Готово к приглашениям</StatusChip>
            ) : (
              <StatusChip tone="warning">Профиль заполнен не полностью</StatusChip>
            )}
            <p className="small muted">Верификация компаний на этапе MVP не проводится, отметки «проверено» нет.</p>
            <ButtonLink to="/employer/needs" iconAfter="arrowRight">
              К потребностям
            </ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
