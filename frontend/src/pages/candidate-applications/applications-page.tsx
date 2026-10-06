import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  type Application,
  ApplicationStatusChip,
  isOpenApplication,
  myApplicationsQuery,
} from '@/entities/application';
import { useScope } from '@/entities/session';
import { formatDate, formatSalaryRange, taxBasisLabel, useDocumentTitle, workModeLabel } from '@/shared/lib';
import { ButtonLink, Card, EmptyState, PageHeader, type TabItem, Tabs } from '@/shared/ui';

export type ApplicationFilter = 'all' | 'open' | 'accepted' | 'closed';

const matches: Record<ApplicationFilter, (application: Application) => boolean> = {
  all: () => true,
  open: isOpenApplication,
  accepted: (application) => application.status === 'accepted',
  closed: (application) => application.status === 'declined' || application.status === 'withdrawn',
};

type Props = { filter: ApplicationFilter; onFilterChange: (filter: ApplicationFilter) => void };

export function CandidateApplicationsPage({ filter, onFilterChange }: Props) {
  useDocumentTitle('Отклики');
  const scope = useScope();
  const { data } = useSuspenseQuery({ ...myApplicationsQuery(scope), refetchOnWindowFocus: 'always' });
  const items = data.items;
  const tabs: TabItem<ApplicationFilter>[] = [
    { id: 'all', label: 'Все', count: items.length },
    { id: 'open', label: 'На рассмотрении', count: items.filter(matches.open).length },
    { id: 'accepted', label: 'Приняты', count: items.filter(matches.accepted).length },
    { id: 'closed', label: 'Отказы и отозванные', count: items.filter(matches.closed).length },
  ];
  const visible = items.filter(matches[filter]);
  return (
    <>
      <PageHeader
        title="Отклики"
        subtitle="Ваши отклики на опубликованные вакансии и решения компаний по ним"
        actions={
          <ButtonLink to="/candidate/vacancies" icon="briefcase">
            Вакансии
          </ButtonLink>
        }
      />
      <Card>
        <Tabs items={tabs} value={filter} onChange={onFilterChange} label="Статус откликов" idPrefix="applications" />
        <div role="tabpanel" id={`applications-panel-${filter}`} aria-labelledby={`applications-tab-${filter}`}>
          {visible.length === 0 ? (
            <EmptyState
              icon="send"
              title={items.length ? 'В этом разделе пусто' : 'Откликов пока нет'}
              actions={
                !items.length && (
                  <ButtonLink to="/candidate/vacancies" variant="primary">
                    Смотреть вакансии
                  </ButtonLink>
                )
              }
            >
              {items.length
                ? 'Выберите другой статус.'
                : 'Откликнитесь на опубликованную вакансию — статус появится здесь.'}
            </EmptyState>
          ) : (
            <ul className="stack" style={{ margin: '1rem 0 0', padding: 0, listStyle: 'none' }}>
              {visible.map((application) => (
                <li key={application.id}>
                  <Card as="article" headingLevel={3}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="stack" style={{ gap: '0.25rem' }}>
                        <h3 style={{ margin: 0 }}>
                          <Link to="/candidate/applications/$applicationId" params={{ applicationId: application.id }}>
                            {application.company.displayName}: {application.vacancy.title}
                          </Link>
                        </h3>
                        <span>
                          <strong>{formatSalaryRange(application.vacancy.salary)}</strong>{' '}
                          <span className="small muted">{taxBasisLabel[application.vacancy.salary.taxBasis]}</span>
                        </span>
                        <span className="small muted">
                          {workModeLabel[application.vacancy.workMode]} · отправлен {formatDate(application.createdAt)}
                        </span>
                      </div>
                      <ApplicationStatusChip status={application.status} audience="candidate" />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
