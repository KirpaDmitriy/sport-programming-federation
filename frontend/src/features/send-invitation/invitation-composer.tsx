import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { AnonymousCandidate } from '@/entities/candidate';
import type { Company } from '@/entities/company';
import { createInvitation, type Invitation, invitationsKey } from '@/entities/invitation';
import type { Need } from '@/entities/need';
import { useScope } from '@/entities/session';
import { describeError, isApiError, newIdempotencyKey } from '@/shared/api';
import { workModeLabel } from '@/shared/lib';
import {
  Button,
  ButtonLink,
  Callout,
  DefinitionList,
  Dialog,
  SalaryBlock,
  SelectField,
  TextareaField,
  useToast,
} from '@/shared/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  candidate: AnonymousCandidate;
  needs: Need[];
  defaultNeedId: string | undefined;
  company: Company;
  onSent: (invitation: Invitation) => void;
};

/** Composes a named invitation; the server snapshots the offer and company terms when it is sent. */
export function InvitationComposer({ open, onClose, candidate, needs, defaultNeedId, company, onSent }: Props) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [needId, setNeedId] = useState(defaultNeedId ?? needs[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const need = needs.find((item) => item.id === needId);

  const send = useMutation({
    mutationFn: () => {
      const input = { candidateId: candidate.id, needId, message: message.trim() };
      const fingerprint = JSON.stringify(input);
      // The same logical send keeps its key across retries; an edited invitation is a new command.
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newIdempotencyKey() };
      return createInvitation(input, pending.current.key);
    },
    onSuccess: async (invitation) => {
      pending.current = null;
      await queryClient.invalidateQueries({ queryKey: invitationsKey(scope) });
      toast(`Приглашение отправлено: ${candidate.alias}`);
      onSent(invitation);
    },
    onError: (error) => {
      if (isApiError(error)) pending.current = null;
      if (isApiError(error, 409)) void queryClient.invalidateQueries({ queryKey: invitationsKey(scope) });
    },
  });

  const messageError = touched && !message.trim() ? 'Опишите предложение для кандидата' : undefined;
  const blocked = !company.readyToInvite;
  const submit = () => {
    setTouched(true);
    if (!message.trim() || !need || blocked) return;
    send.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`Приглашение: ${candidate.alias}`}
      description="Кандидат увидит условия, описание компании и ваш контакт до решения. Его контакты откроются только после принятия."
      footer={
        <>
          <Button onClick={onClose} disabled={send.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            icon="send"
            pending={send.isPending}
            pendingLabel="Отправляем…"
            disabled={blocked || !need}
            onClick={submit}
          >
            Отправить приглашение
          </Button>
        </>
      }
    >
      <div className="split-even">
        <div className="stack">
          {needs.length === 0 ? (
            <Callout
              tone="warning"
              actions={
                <ButtonLink to="/employer/needs/new" size="sm">
                  Описать потребность
                </ButtonLink>
              }
            >
              Сначала сохраните потребность с зарплатной вилкой.
            </Callout>
          ) : (
            <SelectField
              id="invite-need"
              label="Потребность"
              hint="Публиковать вакансию не нужно"
              value={needId}
              onValueChange={(value) => {
                setNeedId(value);
                send.reset();
              }}
              options={needs.map((item) => ({ value: item.id, label: item.title }))}
            />
          )}
          <TextareaField
            id="invite-message"
            label="Описание предложения"
            required
            rows={7}
            maxLength={4000}
            value={message}
            error={messageError}
            onChange={(event) => {
              setMessage(event.target.value);
              send.reset();
            }}
          />
        </div>
        <div className="stack">
          {need && (
            <section className="stack" aria-label="Условия предложения">
              <strong>{need.title}</strong>
              <SalaryBlock salary={need.salary} />
              <span className="small">{workModeLabel[need.workMode]}</span>
              <p className="small muted">{need.description}</p>
              <p className="small muted">
                Условия фиксируются при отправке: последующие правки потребности их не изменят.
              </p>
            </section>
          )}
          <hr className="divider" />
          <section className="stack" aria-label="Компания и контакт">
            <DefinitionList
              items={[
                { term: 'Компания', value: company.displayName || '—' },
                { term: 'Сфера', value: company.businessArea || '—' },
                { term: 'Контакт', value: company.contactEmail },
              ]}
            />
            <p className="small muted">{company.description}</p>
          </section>
        </div>
      </div>
      {blocked && (
        <Callout
          tone="warning"
          title="Профиль компании заполнен не полностью"
          actions={
            <ButtonLink to="/employer/company" size="sm">
              Заполнить профиль
            </ButtonLink>
          }
        >
          Кандидат должен видеть описание компании, сферу деятельности и контакт.
        </Callout>
      )}
      {send.error && (
        <Callout
          tone="danger"
          role="alert"
          title={isApiError(send.error, 409) ? 'Приглашение уже существует' : 'Приглашение не отправлено'}
        >
          {describeError(send.error).message}
        </Callout>
      )}
    </Dialog>
  );
}
