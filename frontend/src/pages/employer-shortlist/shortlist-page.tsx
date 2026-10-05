import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { aliasShape } from '@/entities/candidate';
import { useScope } from '@/entities/session';
import { deleteShortlist, renameShortlist, shortlistKey, shortlistQuery, shortlistsKey } from '@/entities/shortlist';
import { useShortlistMembership } from '@/features/shortlist-membership';
import { describeError } from '@/shared/api';
import { formatDate, useDocumentTitle } from '@/shared/lib';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusChip,
  TextField,
} from '@/shared/ui';

export function EmployerShortlistPage({ shortlistId }: { shortlistId: string }) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: shortlist } = useSuspenseQuery(shortlistQuery(scope, shortlistId));
  useDocumentTitle(`Подборка «${shortlist.title}»`);
  const membership = useShortlistMembership(shortlistId);
  const [title, setTitle] = useState(shortlist.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rename = useMutation({
    mutationFn: () => renameShortlist(shortlistId, title.trim()),
    onSuccess: async (updated) => {
      queryClient.setQueryData(shortlistKey(scope, shortlistId), updated);
      await queryClient.invalidateQueries({ queryKey: shortlistsKey(scope), exact: true });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteShortlist(shortlistId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: shortlistKey(scope, shortlistId) });
      await queryClient.invalidateQueries({ queryKey: shortlistsKey(scope), exact: true });
      await navigate({ to: '/employer/shortlists' });
    },
  });
  return (
    <>
      <ButtonLink to="/employer/shortlists" variant="quiet" icon="arrowLeft">
        Все подборки
      </ButtonLink>
      <PageHeader
        title={`Подборка «${shortlist.title}»`}
        subtitle={`Создана ${formatDate(shortlist.createdAt)} · обновлена ${formatDate(shortlist.updatedAt)}`}
        actions={
          <>
            <ButtonLink to="/employer/candidates" search={{ shortlistId }} icon="search">
              Найти кандидатов
            </ButtonLink>
            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          </>
        }
      />
      <div className="split">
        <Card title="Кандидаты">
          {membership.toggle.error && (
            <Callout tone="danger" role="alert">
              {describeError(membership.toggle.error).message}
            </Callout>
          )}
          {shortlist.members.length === 0 ? (
            <EmptyState icon="users" title="В подборке пока никого нет">
              Добавляйте кандидатов закладкой в поиске или в профиле.
            </EmptyState>
          ) : (
            <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {shortlist.members.map((member) => (
                <li key={member.candidateId} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row">
                    <span aria-hidden="true">{aliasShape(member.alias)}</span>
                    {member.available ? (
                      <Link to="/employer/candidates/$candidateId" params={{ candidateId: member.candidateId }}>
                        <strong>{member.alias}</strong>
                      </Link>
                    ) : (
                      <strong>{member.alias}</strong>
                    )}
                    {!member.available && (
                      <StatusChip tone="neutral">Профиль недоступен: скрыт или вышел из банка</StatusChip>
                    )}
                  </span>
                  <Button
                    variant="quiet"
                    icon="x"
                    disabled={membership.toggle.isPending}
                    onClick={() =>
                      membership.toggle.mutate({ candidateId: member.candidateId, alias: member.alias, member: true })
                    }
                  >
                    Убрать
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Название">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim()) rename.mutate();
            }}
          >
            <TextField
              id="shortlist-rename"
              label="Название подборки"
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={title.trim() ? undefined : 'Название не может быть пустым'}
            />
            {rename.error && <Callout tone="danger">{describeError(rename.error).message}</Callout>}
            <Button
              type="submit"
              pending={rename.isPending}
              disabled={!title.trim() || title.trim() === shortlist.title}
            >
              Переименовать
            </Button>
          </form>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Удалить подборку?"
        confirmLabel="Удалить"
        danger
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>Кандидаты останутся в банке, удалится только этот список.</p>
        {remove.error && <Callout tone="danger">{describeError(remove.error).message}</Callout>}
      </ConfirmDialog>
    </>
  );
}
