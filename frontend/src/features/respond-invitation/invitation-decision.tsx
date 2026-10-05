import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  acceptInvitation,
  type DisclosureField,
  declineInvitation,
  disclosureFieldLabel,
  type Invitation,
  invitationsKey,
  isOpenInvitation,
} from '@/entities/invitation';
import type { Profile } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { Button, Callout, Card, Checkbox, ConfirmDialog, Icon } from '@/shared/ui';

type Props = { invitation: Invitation; profile: Profile };

/** Acceptance is the candidate's explicit, server-confirmed act; nothing is disclosed before the response. */
export function InvitationDecision({ invitation, profile }: Props) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<DisclosureField[]>(['name', 'email']);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const company = invitation.company.displayName;

  const settle = async (updated?: Invitation) => {
    if (updated) queryClient.setQueryData([...invitationsKey(scope), invitation.id], updated);
    await queryClient.invalidateQueries({ queryKey: invitationsKey(scope) });
  };
  const onError = (error: unknown) => {
    // Another tab or the employer may have changed the state; show the canonical record.
    if (isApiError(error, 409)) void settle();
  };
  const accept = useMutation({
    mutationFn: () => acceptInvitation(invitation.id, fields),
    onSuccess: settle,
    onError,
  });
  const decline = useMutation({
    mutationFn: () => declineInvitation(invitation.id),
    onSuccess: async (updated) => {
      setConfirmDecline(false);
      await settle(updated);
    },
    onError,
  });
  const conflict = [accept.error, decline.error].find((error) => isApiError(error, 409)) ?? null;
  const otherError = [accept.error, decline.error].find((error) => error && !isApiError(error, 409)) ?? null;

  if (invitation.status === 'accepted') {
    return (
      <Card title="Вы приняли приглашение">
        <div className="stack">
          <p>
            {invitation.respondedAt ? formatDateTime(invitation.respondedAt) : ''}. Компания «{company}» получила только
            выбранные данные:
          </p>
          <ul className="stack" style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {invitation.disclosureFields.map((field) => (
              <li key={field}>{disclosureFieldLabel[field]}</li>
            ))}
          </ul>
          <p className="small muted">Другие компании по-прежнему видят обезличенный профиль.</p>
          <p className="small">Дальше вы общаетесь напрямую: контакт компании указан в приглашении.</p>
        </div>
      </Card>
    );
  }
  if (invitation.status === 'declined') {
    return (
      <Card title="Вы отклонили приглашение">
        <p>Контакты и ссылки компании «{company}» не переданы. Условия сохранены в истории.</p>
      </Card>
    );
  }
  if (invitation.status === 'withdrawn') {
    return (
      <Card title="Приглашение отозвано">
        <p>Компания отозвала предложение. Принять или отклонить его уже нельзя, условия остаются в истории.</p>
      </Card>
    );
  }

  const toggle = (field: DisclosureField, checked: boolean) =>
    setFields((current) => (checked ? [...current, field] : current.filter((item) => item !== field)));
  const busy = accept.isPending || decline.isPending;

  return (
    <Card title="Что откроется после принятия">
      <div className="stack">
        <p className="muted">Только выбранные данные получат участники найма «{company}» по этому приглашению.</p>
        <fieldset className="stack" style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="visually-hidden">Данные для компании «{company}»</legend>
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
            description="Ссылки на репозитории из подключённых источников. Выбираются отдельно от контактов."
          />
        </fieldset>
        {fields.length === 0 && (
          <Callout tone="warning" role="alert">
            Выберите хотя бы одно поле: без него компания не сможет с вами связаться.
          </Callout>
        )}
        <p className="small muted" style={{ display: 'flex', gap: '0.5rem' }}>
          <Icon name="info" size={18} />
          Другим компаниям данные не откроются.
        </p>
        {conflict !== null && (
          <Callout tone="warning" role="alert" title="Статус уже изменился">
            {describeError(conflict).message}. Показано актуальное состояние приглашения.
          </Callout>
        )}
        {otherError !== null && (
          <Callout tone="danger" role="alert">
            Решение не отправлено: {describeError(otherError).message} Контакты остаются закрытыми.
          </Callout>
        )}
        <Button
          variant="primary"
          block
          disabled={fields.length === 0 || !isOpenInvitation(invitation) || decline.isPending}
          pending={accept.isPending}
          pendingLabel="Отправляем решение…"
          onClick={() => accept.mutate()}
        >
          Принять и открыть контакты
        </Button>
        <Button block disabled={busy} onClick={() => setConfirmDecline(true)}>
          Отклонить
        </Button>
        <p className="small muted">Условия сохранятся в истории приглашения.</p>
      </div>
      <ConfirmDialog
        open={confirmDecline}
        title="Отклонить приглашение?"
        confirmLabel="Отклонить"
        danger
        pending={decline.isPending}
        onConfirm={() => decline.mutate()}
        onCancel={() => setConfirmDecline(false)}
      >
        <p>Компания «{company}» увидит отказ. Ваши контакты не будут переданы.</p>
      </ConfirmDialog>
    </Card>
  );
}
