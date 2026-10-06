import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { applicationsKey, createApplication } from '@/entities/application';
import { type DisclosureField, disclosureFieldLabel } from '@/entities/invitation';
import type { Profile } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { eligibilityView, type Vacancy, vacanciesKey } from '@/entities/vacancy';
import { describeError, isApiError, newIdempotencyKey } from '@/shared/api';
import { Button, ButtonLink, Callout, Card, Checkbox, Icon, TextareaField, useToast } from '@/shared/ui';

const MESSAGE_LIMIT = 4000;

type Props = { vacancy: Vacancy; profile: Profile };

/** Applying discloses the chosen fields to this company at once, so the choice is explicit before sending. */
export function ApplyPanel({ vacancy, profile }: Props) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [fields, setFields] = useState<DisclosureField[]>(['name', 'email']);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const company = vacancy.company.displayName;

  const apply = useMutation({
    mutationFn: () => {
      const input = { vacancyId: vacancy.id, message: message.trim(), disclose: fields };
      const fingerprint = JSON.stringify(input);
      // One intended application keeps its key across transport retries; an edited one is a new command.
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newIdempotencyKey() };
      return createApplication(input, pending.current.key);
    },
    onSuccess: async (application) => {
      pending.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: vacanciesKey(scope) }),
        queryClient.invalidateQueries({ queryKey: applicationsKey(scope) }),
      ]);
      toast(`Отклик отправлен в «${company}»`);
      await navigate({ to: '/candidate/applications/$applicationId', params: { applicationId: application.id } });
    },
    onError: (error) => {
      if (isApiError(error)) pending.current = null;
      if (isApiError(error, 409) || isApiError(error, 404))
        void queryClient.invalidateQueries({ queryKey: vacanciesKey(scope) });
    },
  });

  if (vacancy.applicationId) {
    return (
      <Card title="Вы откликнулись">
        <div className="stack">
          <p>Компания «{company}» уже получила ваш отклик и выбранные контакты.</p>
          <ButtonLink
            to="/candidate/applications/$applicationId"
            params={{ applicationId: vacancy.applicationId }}
            variant="primary"
            iconAfter="arrowRight"
          >
            Статус отклика
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const blocker = vacancy.eligibility.reason ? eligibilityView[vacancy.eligibility.reason] : null;
  if (blocker) {
    return (
      <Card title="Отклик пока недоступен">
        <div className="stack">
          <p>{blocker.text}</p>
          {blocker.action && (
            <ButtonLink to={blocker.action.to} variant="primary" iconAfter="arrowRight">
              {blocker.action.label}
            </ButtonLink>
          )}
        </div>
      </Card>
    );
  }

  const messageError = touched && !message.trim() ? 'Напишите пару предложений для компании' : undefined;
  const toggle = (field: DisclosureField, checked: boolean) =>
    setFields((current) => (checked ? [...current, field] : current.filter((item) => item !== field)));
  const submit = () => {
    setTouched(true);
    if (!message.trim() || fields.length === 0) return;
    apply.mutate();
  };
  const error = apply.error;

  return (
    <Card title="Откликнуться">
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextareaField
          id="application-message"
          label="Сопроводительное письмо"
          required
          rows={6}
          maxLength={MESSAGE_LIMIT}
          value={message}
          error={messageError}
          hint="Чем вам интересна роль и какой опыт для неё важен"
          onChange={(event) => setMessage(event.target.value)}
        />
        <fieldset className="stack" style={{ margin: 0, padding: 0, border: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Что получит «{company}»</legend>
          <Checkbox
            checked={fields.includes('name')}
            onChange={(event) => toggle('name', event.target.checked)}
            label={disclosureFieldLabel.name}
            description={profile.name}
          />
          <Checkbox
            checked={fields.includes('email')}
            onChange={(event) => toggle('email', event.target.checked)}
            label={disclosureFieldLabel.email}
            description={profile.email}
          />
          <Checkbox
            checked={fields.includes('sourceLinks')}
            onChange={(event) => toggle('sourceLinks', event.target.checked)}
            label={disclosureFieldLabel.sourceLinks}
            description="Ссылки на репозитории из подключённых источников"
          />
        </fieldset>
        {fields.length === 0 && (
          <Callout tone="warning" role="alert">
            Выберите хотя бы одно поле: без него компания не сможет с вами связаться.
          </Callout>
        )}
        <p className="small muted" style={{ display: 'flex', gap: '0.5rem' }}>
          <Icon name="info" size={18} />
          Компания увидит подтверждённый грейд и навыки сразу, контакты — только выбранные. Другим компаниям они не
          откроются.
        </p>
        {error && (
          <Callout tone={isApiError(error, 409) ? 'warning' : 'danger'} role="alert">
            {isApiError(error, 404)
              ? 'Вакансия снята с публикации — отклик не отправлен.'
              : `Отклик не отправлен: ${describeError(error).message}`}
          </Callout>
        )}
        <Button
          type="submit"
          variant="primary"
          block
          disabled={fields.length === 0}
          pending={apply.isPending}
          pendingLabel="Отправляем отклик…"
        >
          Откликнуться и открыть контакты
        </Button>
      </form>
    </Card>
  );
}
