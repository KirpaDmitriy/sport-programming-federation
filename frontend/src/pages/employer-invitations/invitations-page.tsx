import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  companyInvitationsQuery,
  disclosureFieldLabel,
  type Invitation,
  InvitationStatusChip,
  invitationsKey,
  isOpenInvitation,
  withdrawInvitation,
} from '@/entities/invitation';
import { useScope } from '@/entities/session';
import { describeError, isApiError } from '@/shared/api';
import { formatDateTime, formatSalaryRange, taxBasisLabel, useDocumentTitle, workModeLabel } from '@/shared/lib';
import { Button, Callout, Card, ConfirmDialog, EmptyState, PageHeader, type TabItem, Tabs } from '@/shared/ui';

export type EmployerInvitationFilter = 'all' | 'open' | 'accepted' | 'closed';

const matches: Record<EmployerInvitationFilter, (invitation: Invitation) => boolean> = {
  all: () => true,
  open: isOpenInvitation,
  accepted: (invitation) => invitation.status === 'accepted',
  closed: (invitation) => invitation.status === 'declined' || invitation.status === 'withdrawn',
};

type Props = { filter: EmployerInvitationFilter; onFilterChange: (filter: EmployerInvitationFilter) => void };

export function EmployerInvitationsPage({ filter, onFilterChange }: Props) {
  useDocumentTitle('Приглашения');
  const scope = useScope();
  const queryClient = useQueryClient();
  const invitations = useSuspenseQuery({ ...companyInvitationsQuery(scope), refetchOnWindowFocus: 'always' });
  const [pendingWithdraw, setPendingWithdraw] = useState<Invitation | null>(null);
  const withdraw = useMutation({
    mutationFn: (invitation: Invitation) => withdrawInvitation(invitation.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitationsKey(scope) }),
    onSuccess: () => setPendingWithdraw(null),
  });
  const items = [...invitations.data.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tabs: TabItem<EmployerInvitationFilter>[] = [
    { id: 'all', label: 'Все', count: items.length },
    { id: 'open', label: 'Ждут ответа', count: items.filter(matches.open).length },
    { id: 'accepted', label: 'Приняты', count: items.filter(matches.accepted).length },
    { id: 'closed', label: 'Отклонены и отозваны', count: items.filter(matches.closed).length },
  ];
  const visible = items.filter(matches[filter]);

  return (
    <>
      <PageHeader
        title="Приглашения"
        subtitle="Статусы отправленных предложений. Условия каждого приглашения зафиксированы на момент отправки."
        actions={
          <Button
            icon="refresh"
            pending={invitations.isFetching}
            pendingLabel="Обновляем…"
            onClick={() => invitations.refetch()}
          >
            Обновить статусы
          </Button>
        }
      />
      <Card>
        <Tabs
          items={tabs}
          value={filter}
          onChange={onFilterChange}
          label="Статус приглашений"
          idPrefix="company-invitations"
        />
        <div
          role="tabpanel"
          id={`company-invitations-panel-${filter}`}
          aria-labelledby={`company-invitations-tab-${filter}`}
        >
          {visible.length === 0 ? (
            <EmptyState icon="send" title={items.length ? 'В этом разделе пусто' : 'Приглашений пока нет'}>
              Найдите кандидата в поиске и отправьте приглашение с зарплатной вилкой — публикация вакансии не нужна.
            </EmptyState>
          ) : (
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Кандидат</th>
                    <th scope="col">Предложение</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Хронология</th>
                    <th scope="col">
                      <span className="visually-hidden">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>
                        <Link
                          to="/employer/candidates/$candidateId"
                          params={{ candidateId: invitation.candidateId }}
                          search={{ needId: invitation.need.id }}
                        >
                          <strong>{invitation.candidateAlias}</strong>
                        </Link>
                      </td>
                      <td>
                        {invitation.need.title}
                        <div className="small">
                          {formatSalaryRange(invitation.need.salary)} · {taxBasisLabel[invitation.need.salary.taxBasis]}
                        </div>
                        <div className="small muted">{workModeLabel[invitation.need.workMode]}</div>
                      </td>
                      <td>
                        <InvitationStatusChip status={invitation.status} audience="employer" />
                        {invitation.status === 'accepted' && (
                          <div className="small">
                            Открыто:{' '}
                            {invitation.disclosureFields.map((field) => disclosureFieldLabel[field]).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="small">
                        <div>Отправлено {formatDateTime(invitation.createdAt)}</div>
                        {invitation.viewedAt && <div>Просмотрено {formatDateTime(invitation.viewedAt)}</div>}
                        {invitation.respondedAt && <div>Решение {formatDateTime(invitation.respondedAt)}</div>}
                      </td>
                      <td>
                        {isOpenInvitation(invitation) && (
                          <Button size="sm" variant="danger" onClick={() => setPendingWithdraw(invitation)}>
                            Отозвать
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={pendingWithdraw !== null}
        title="Отозвать приглашение?"
        confirmLabel="Отозвать"
        danger
        pending={withdraw.isPending}
        onConfirm={() => pendingWithdraw && withdraw.mutate(pendingWithdraw)}
        onCancel={() => {
          setPendingWithdraw(null);
          withdraw.reset();
        }}
      >
        <div className="stack">
          <p>
            Кандидат {pendingWithdraw?.candidateAlias} увидит, что предложение отозвано. Контакты не будут переданы.
          </p>
          {withdraw.error && (
            <Callout tone={isApiError(withdraw.error, 409) ? 'warning' : 'danger'} role="alert">
              {isApiError(withdraw.error, 409)
                ? 'Кандидат уже принял решение — статус обновлён.'
                : describeError(withdraw.error).message}
            </Callout>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
