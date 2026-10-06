import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  type Application,
  ApplicationStatusChip,
  companyApplicationsQuery,
  isOpenApplication,
} from '@/entities/application';
import { disclosureFieldLabel } from '@/entities/invitation';
import { useScope } from '@/entities/session';
import { formatDateTime, formatSalaryRange, gradeLabel, useDocumentTitle } from '@/shared/lib';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  SelectField,
  StatusChip,
  type TabItem,
  TableWrap,
  Tabs,
} from '@/shared/ui';

export type EmployerApplicationFilter = 'all' | 'open' | 'accepted' | 'closed';

const matches: Record<EmployerApplicationFilter, (application: Application) => boolean> = {
  all: () => true,
  open: isOpenApplication,
  accepted: (application) => application.status === 'accepted',
  closed: (application) => application.status === 'declined' || application.status === 'withdrawn',
};

type Props = {
  filter: EmployerApplicationFilter;
  needId: string | undefined;
  onChange: (patch: { status?: EmployerApplicationFilter; needId?: string | undefined }) => void;
};

export function EmployerApplicationsPage({ filter, needId, onChange }: Props) {
  useDocumentTitle('Отклики');
  const scope = useScope();
  const applications = useSuspenseQuery({ ...companyApplicationsQuery(scope), refetchOnWindowFocus: 'always' });
  const all = applications.data.items;
  const vacancies = [...new Map(all.map((item) => [item.vacancy.id, item.vacancy.title])).entries()];
  const scoped = needId ? all.filter((item) => item.vacancy.id === needId) : all;
  const tabs: TabItem<EmployerApplicationFilter>[] = [
    { id: 'all', label: 'Все', count: scoped.length },
    { id: 'open', label: 'Ждут решения', count: scoped.filter(matches.open).length },
    { id: 'accepted', label: 'Приняты', count: scoped.filter(matches.accepted).length },
    { id: 'closed', label: 'Отклонены и отозваны', count: scoped.filter(matches.closed).length },
  ];
  const visible = scoped.filter(matches[filter]);

  return (
    <>
      <PageHeader
        title="Отклики"
        subtitle="Кандидаты, которые сами откликнулись на опубликованные вакансии. Контакты открыты по их выбору."
        actions={
          <Button
            icon="refresh"
            pending={applications.isFetching}
            pendingLabel="Обновляем…"
            onClick={() => applications.refetch()}
          >
            Обновить
          </Button>
        }
      />
      <Card>
        {vacancies.length > 1 && (
          <div style={{ maxWidth: '28rem', marginBottom: '1rem' }}>
            <SelectField
              id="applications-vacancy"
              label="Вакансия"
              value={needId ?? ''}
              onValueChange={(value) => onChange({ needId: value || undefined })}
              options={[{ value: '', label: 'Все вакансии' }, ...vacancies.map(([value, label]) => ({ value, label }))]}
            />
          </div>
        )}
        <Tabs
          items={tabs}
          value={filter}
          onChange={(status) => onChange({ status })}
          label="Статус откликов"
          idPrefix="company-applications"
        />
        <div
          role="tabpanel"
          id={`company-applications-panel-${filter}`}
          aria-labelledby={`company-applications-tab-${filter}`}
        >
          {visible.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={all.length ? 'В этом разделе пусто' : 'Откликов пока нет'}
              actions={
                !all.length && (
                  <ButtonLink to="/employer/needs" variant="primary">
                    К потребностям
                  </ButtonLink>
                )
              }
            >
              {all.length
                ? 'Выберите другой статус или вакансию.'
                : 'Опубликуйте потребность как вакансию — отклики кандидатов появятся здесь.'}
            </EmptyState>
          ) : (
            <TableWrap label="Отклики" style={{ marginTop: '1rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Кандидат</th>
                    <th scope="col">Вакансия</th>
                    <th scope="col">Соответствие</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Хронология</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((application) => (
                    <tr key={application.id}>
                      <td>
                        <Link to="/employer/applications/$applicationId" params={{ applicationId: application.id }}>
                          <strong>{application.candidateAlias}</strong>
                        </Link>
                        <div className="small muted">
                          Открыто: {application.disclosureFields.map((field) => disclosureFieldLabel[field]).join(', ')}
                        </div>
                      </td>
                      <td>
                        {application.vacancy.title}
                        <div className="small">{formatSalaryRange(application.vacancy.salary)}</div>
                        <div className="small muted">от {gradeLabel[application.vacancy.grade]}</div>
                      </td>
                      <td className="small">
                        <div>
                          Обязательные: {application.match.requiredMet} из {application.match.requiredTotal}
                        </div>
                        {application.match.gradeMatches ? (
                          <StatusChip tone="success" plain>
                            Грейд подходит
                          </StatusChip>
                        ) : (
                          <StatusChip tone="warning" plain>
                            Грейд ниже требуемого
                          </StatusChip>
                        )}
                      </td>
                      <td>
                        <ApplicationStatusChip status={application.status} audience="employer" />
                      </td>
                      <td className="small">
                        <div>Получен {formatDateTime(application.createdAt)}</div>
                        {application.viewedAt && <div>Просмотрен {formatDateTime(application.viewedAt)}</div>}
                        {application.respondedAt && <div>Решение {formatDateTime(application.respondedAt)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </Card>
    </>
  );
}
