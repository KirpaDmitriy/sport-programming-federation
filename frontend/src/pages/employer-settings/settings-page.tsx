import { useSuspenseQuery } from '@tanstack/react-query';
import { companyQuery } from '@/entities/company';
import { useScope, useSession } from '@/entities/session';
import { useLogout } from '@/features/auth';
import { useDocumentTitle } from '@/shared/lib';
import { Button, ButtonLink, Card, DefinitionList, PageHeader } from '@/shared/ui';

export function EmployerSettingsPage() {
  useDocumentTitle('Настройки');
  const session = useSession();
  const scope = useScope();
  const { data: company } = useSuspenseQuery(companyQuery(scope));
  const logout = useLogout();
  return (
    <>
      <PageHeader title="Настройки" subtitle="Аккаунт работодателя и доступ к данным кандидатов" />
      <div className="split-even">
        <Card title="Аккаунт">
          <div className="stack">
            <DefinitionList
              items={[
                { term: 'Компания', value: company.displayName || '—' },
                { term: 'Роль', value: 'Работодатель' },
                { term: 'Почта подтверждена', value: session.emailVerified ? 'Да' : 'Нет' },
              ]}
            />
            <ButtonLink to="/employer/company">Профиль компании</ButtonLink>
            <Button icon="logout" onClick={() => logout.mutate()} pending={logout.isPending}>
              Выйти
            </Button>
            <p className="small muted">При выходе данные компании удаляются из памяти вкладки.</p>
          </div>
        </Card>
        <Card title="Доступ к данным кандидатов">
          <ul className="stack small" style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>
              До согласия кандидата профиль обезличен: псевдоним, подтверждённая категория и обобщённые свидетельства.
            </li>
            <li>
              Контакты открываются, только когда кандидат принимает приглашение вашей компании, и только выбранные им
              поля.
            </li>
            <li>Раскрытие для вашей компании не открывает профиль другим компаниям.</li>
            <li>Чата на платформе нет: после принятия связывайтесь с кандидатом напрямую.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
