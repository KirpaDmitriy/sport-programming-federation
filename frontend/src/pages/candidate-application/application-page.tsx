import { useSuspenseQuery } from '@tanstack/react-query';
import { ApplicationStatusChip, myApplicationQuery } from '@/entities/application';
import { companyInitials } from '@/entities/company';
import { disclosureFieldLabel } from '@/entities/invitation';
import { useScope } from '@/entities/session';
import { VacancyFitChip } from '@/entities/vacancy';
import { WithdrawApplication } from '@/features/apply-vacancy';
import { formatDateTime, gradeLabel, specializationLabel, useDocumentTitle, workModeLabel } from '@/shared/lib';
import { Avatar, ButtonLink, Card, Icon, SalaryBlock, Tag } from '@/shared/ui';

const outcome = {
  sent: 'Компания ещё не открывала отклик.',
  viewed: 'Компания просмотрела отклик и принимает решение.',
  accepted: 'Компания готова к разговору и свяжется с вами по открытым контактам. Можно написать и самим.',
  declined: 'Компания отказала по этому отклику. Условия и письмо сохранены в истории.',
  withdrawn: 'Вы отозвали отклик. Контакты, открытые им, компании больше недоступны.',
} as const;

export function CandidateApplicationPage({ applicationId }: { applicationId: string }) {
  useDocumentTitle('Отклик');
  const scope = useScope();
  const { data: application } = useSuspenseQuery({
    ...myApplicationQuery(scope, applicationId),
    refetchOnWindowFocus: 'always',
  });
  const { company, vacancy } = application;
  return (
    <>
      <ButtonLink to="/candidate/applications" variant="quiet" icon="arrowLeft">
        Все отклики
      </ButtonLink>
      <header className="stack" style={{ margin: '0.75rem 0 1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Отклик в «{company.displayName}»</h1>
        <div className="row">
          <ApplicationStatusChip status={application.status} audience="candidate" />
          <span className="small muted">Отправлен {formatDateTime(application.createdAt)}</span>
        </div>
      </header>
      <div className="split">
        <Card>
          <div className="stack-lg">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar kind="company" text={companyInitials(company)} size="lg" />
              <div className="stack" style={{ gap: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>{vacancy.title}</h2>
                <span className="muted">{company.displayName}</span>
                <div className="row">
                  <Tag>
                    <Icon name="pin" size={16} /> {workModeLabel[vacancy.workMode]}
                  </Tag>
                  <Tag>
                    {specializationLabel[vacancy.specialization]} · от {gradeLabel[vacancy.grade]}
                  </Tag>
                </div>
              </div>
            </div>
            <SalaryBlock salary={vacancy.salary} />
            <p className="small muted">Условия зафиксированы на момент отклика.</p>
            <section className="stack">
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Что предстоит делать</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{vacancy.description}</p>
            </section>
            <section className="stack">
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Ваше письмо</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{application.message}</p>
            </section>
            <section className="stack">
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Соответствие требованиям</h3>
              <div>
                <VacancyFitChip status={application.match.status} />
              </div>
              <p className="small muted">{application.match.explanation}</p>
            </section>
            <hr className="divider" />
            <section className="stack">
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Контакт компании</h3>
              <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
            </section>
          </div>
        </Card>
        <div className="stack-lg">
          <Card title="Статус">
            <div className="stack">
              <p>{outcome[application.status]}</p>
              <ul className="small" style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>Отправлен {formatDateTime(application.createdAt)}</li>
                {application.viewedAt && <li>Просмотрен {formatDateTime(application.viewedAt)}</li>}
                {application.respondedAt && <li>Решение {formatDateTime(application.respondedAt)}</li>}
              </ul>
              <WithdrawApplication application={application} />
            </div>
          </Card>
          <Card title="Что получила компания">
            <div className="stack">
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {application.disclosureFields.map((field) => (
                  <li key={field}>{disclosureFieldLabel[field]}</li>
                ))}
              </ul>
              <p className="small muted">Другим компаниям эти данные не открываются.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
