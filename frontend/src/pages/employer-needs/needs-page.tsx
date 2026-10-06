import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { companyApplicationsQuery } from '@/entities/application';
import { skillLabel, useMeta } from '@/entities/meta';
import { deleteNeed, type Need, needsKey, needsQuery } from '@/entities/need';
import { useScope } from '@/entities/session';
import { PublishControl } from '@/features/publish-need';
import { describeError } from '@/shared/api';
import {
  formatDate,
  formatSalaryRange,
  gradeLabel,
  specializationLabel,
  taxBasisLabel,
  useDocumentTitle,
  workModeLabel,
} from '@/shared/lib';
import { Button, ButtonLink, Callout, Card, ConfirmDialog, EmptyState, PageHeader, StatusChip } from '@/shared/ui';

type CardProps = { need: Need; applications: number; onDelete: (need: Need) => void };

function NeedCard({ need, applications, onDelete }: CardProps) {
  const meta = useMeta();
  const required = need.requirements.filter((item) => item.criticality === 'required');
  const desired = need.requirements.filter((item) => item.criticality === 'desired');
  return (
    <Card as="article" headingLevel={3}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: '0.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{need.title}</h3>
            <span className="muted">
              {specializationLabel[need.specialization]} · {gradeLabel[need.grade]} · {workModeLabel[need.workMode]}
            </span>
          </div>
          {need.published && need.publishedAt ? (
            <StatusChip tone="success" icon="eye">
              Опубликована {formatDate(need.publishedAt)}
            </StatusChip>
          ) : (
            <StatusChip tone="neutral" icon="lock">
              Не опубликована — приглашать можно без публикации
            </StatusChip>
          )}
        </div>
        <p>
          <strong>{formatSalaryRange(need.salary)}</strong>{' '}
          <span className="small muted">{taxBasisLabel[need.salary.taxBasis]}</span>
        </p>
        <p className="small">
          Обязательно: {required.map((item) => skillLabel(meta, item.skillId)).join(', ') || '—'}
          {desired.length > 0 && ` · Желательно: ${desired.map((item) => skillLabel(meta, item.skillId)).join(', ')}`}
        </p>
        <p className="small muted">Обновлена {formatDate(need.updatedAt)}</p>
        <div className="row">
          <ButtonLink
            to="/employer/candidates"
            search={{ needId: need.id, mode: 'recommended' }}
            variant="primary"
            iconAfter="arrowRight"
          >
            Найти кандидатов
          </ButtonLink>
          <ButtonLink to="/employer/needs/$needId" params={{ needId: need.id }} icon="edit">
            Редактировать
          </ButtonLink>
          <PublishControl need={need} />
          {(need.published || applications > 0) && (
            <ButtonLink to="/employer/applications" search={{ needId: need.id }} icon="inbox">
              Отклики: {applications}
            </ButtonLink>
          )}
          <Button variant="quiet" icon="trash" onClick={() => onDelete(need)}>
            Удалить
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function EmployerNeedsPage() {
  useDocumentTitle('Потребности');
  const scope = useScope();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(needsQuery(scope));
  const applications = useQuery(companyApplicationsQuery(scope));
  const countFor = (needId: string) =>
    applications.data?.items.filter((item) => item.vacancy.id === needId).length ?? 0;
  const [pendingDelete, setPendingDelete] = useState<Need | null>(null);
  const remove = useMutation({
    mutationFn: (need: Need) => deleteNeed(need.id),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: needsKey(scope) });
    },
  });
  return (
    <>
      <PageHeader
        title="Потребности"
        subtitle="Опишите, кого ищете. Подбор и приглашения работают без публикации; опубликованная потребность становится вакансией для откликов."
        actions={
          <ButtonLink to="/employer/needs/new" variant="primary" icon="plus">
            Новая потребность
          </ButtonLink>
        }
      />
      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="briefcase"
            title="Потребностей пока нет"
            actions={
              <ButtonLink to="/employer/needs/new" variant="primary">
                Описать потребность
              </ButtonLink>
            }
          >
            Потребность задаёт специализацию, грейд, требования и зарплатную вилку — по ней строится подборка.
          </EmptyState>
        </Card>
      ) : (
        <ul className="stack-lg" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.items.map((need) => (
            <li key={need.id}>
              <NeedCard need={need} applications={countFor(need.id)} onDelete={setPendingDelete} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить потребность?"
        confirmLabel="Удалить"
        danger
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
      >
        <div className="stack">
          <p>
            «{pendingDelete?.title}» исчезнет из подбора{pendingDelete?.published ? ' и из списка вакансий' : ''}. Уже
            отправленные приглашения и полученные отклики сохранят свои условия.
          </p>
          {remove.error && <Callout tone="danger">{describeError(remove.error).message}</Callout>}
        </div>
      </ConfirmDialog>
    </>
  );
}
