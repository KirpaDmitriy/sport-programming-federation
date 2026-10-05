import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { companyInitials } from '@/entities/company';
import { InvitationStatusChip, invitationsKey, markInvitationViewed, myInvitationQuery } from '@/entities/invitation';
import { skillLabel, useMeta } from '@/entities/meta';
import { profileQuery } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { myGapPlanQuery } from '@/entities/skill';
import { InvitationDecision } from '@/features/respond-invitation';
import { formatDateTime, useDocumentTitle, workModeLabel } from '@/shared/lib';
import { Avatar, ButtonLink, Card, Icon, SalaryBlock, StatusChip, Tag } from '@/shared/ui';

function GapPlan({ needId }: { needId: string }) {
  const scope = useScope();
  const meta = useMeta();
  const plan = useQuery(myGapPlanQuery(scope, needId));
  if (!plan.data || plan.data.items.length === 0) return null;
  return (
    <section className="stack" aria-labelledby="gap-plan">
      <h3 id="gap-plan" style={{ margin: 0, fontSize: '1rem' }}>
        Что можно подтвердить для этой роли
      </h3>
      <ul className="stack small" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {plan.data.items.map((item) => (
          <li key={item.skillId}>
            <strong>{skillLabel(meta, item.skillId)}:</strong> {item.reason} {item.action}
          </li>
        ))}
      </ul>
      <p className="small muted">Пробелы не мешают принять приглашение: компания уже видела обезличенный профиль.</p>
    </section>
  );
}

export function CandidateInvitationPage({ invitationId }: { invitationId: string }) {
  useDocumentTitle('Приглашение');
  const scope = useScope();
  const queryClient = useQueryClient();
  const { data: invitation } = useSuspenseQuery(myInvitationQuery(scope, invitationId));
  const { data: profile } = useSuspenseQuery(profileQuery(scope));
  const viewed = useRef(false);
  const markViewed = useMutation({
    mutationFn: () => markInvitationViewed(invitationId),
    onSuccess: (updated) => {
      queryClient.setQueryData([...invitationsKey(scope), invitationId], updated);
      void queryClient.invalidateQueries({ queryKey: invitationsKey(scope), exact: true });
    },
  });
  const { mutate } = markViewed;

  useEffect(() => {
    // Opening the detail records "viewed" once; it grants nothing to the company.
    if (invitation.status === 'sent' && !viewed.current) {
      viewed.current = true;
      mutate();
    }
  }, [invitation.status, mutate]);

  const company = invitation.company;
  return (
    <>
      <ButtonLink to="/candidate/invitations" variant="quiet" icon="arrowLeft">
        Все приглашения
      </ButtonLink>
      <header className="stack" style={{ margin: '0.75rem 0 1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Приглашение от «{company.displayName}»</h1>
        <div className="row">
          <InvitationStatusChip status={invitation.status} audience="candidate" />
          <span className="small muted">Получено {formatDateTime(invitation.createdAt)}</span>
        </div>
      </header>
      <div className="split">
        <div className="stack-lg">
          <Card>
            <div className="stack-lg">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Avatar kind="company" text={companyInitials(company)} size="lg" />
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <h2 style={{ margin: 0 }}>{company.displayName}</h2>
                  <span className="muted">{invitation.need.title}</span>
                  <div className="row">
                    <Tag>
                      <Icon name="pin" size={16} /> {workModeLabel[invitation.need.workMode]}
                    </Tag>
                    <StatusChip tone="neutral" icon="briefcase">
                      Без публикации вакансии
                    </StatusChip>
                  </div>
                </div>
              </div>
              <SalaryBlock salary={invitation.need.salary} />
              <hr className="divider" />
              <section className="stack">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Что предстоит делать</h3>
                <p>{invitation.need.description}</p>
              </section>
              <section className="stack">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Сообщение компании</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{invitation.message}</p>
              </section>
              <hr className="divider" />
              <section className="stack">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>О компании</h3>
                <p>{company.description}</p>
                <p className="small muted">Сфера деятельности: {company.businessArea}</p>
              </section>
              <section className="stack">
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Контакт от работодателя</h3>
                <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
              </section>
              <GapPlan needId={invitation.need.id} />
            </div>
          </Card>
        </div>
        <InvitationDecision invitation={invitation} profile={profile} />
      </div>
      <Card style={{ marginTop: '1.5rem' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Avatar kind="anonymous" size="md" />
          <div className="stack" style={{ gap: '0.25rem' }}>
            <strong>Как работодатель свяжется с вами</strong>
            <p className="muted">
              После принятия компания получит выбранные контакты и свяжется с вами напрямую. Переписки внутри платформы
              нет — контакт компании указан выше.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
