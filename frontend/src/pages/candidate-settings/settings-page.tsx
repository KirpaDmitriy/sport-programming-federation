import { useSuspenseQuery } from '@tanstack/react-query';
import { blockerLabel, profileQuery } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { mySourcesQuery } from '@/entities/source';
import { useLogout } from '@/features/auth';
import { ConsentControls } from '@/features/consents';
import { useDocumentTitle } from '@/shared/lib';
import { Button, ButtonLink, Card, DefinitionList, PageHeader, StatusChip } from '@/shared/ui';

export function CandidateSettingsPage() {
  useDocumentTitle('Настройки');
  const scope = useScope();
  const { data: profile } = useSuspenseQuery(profileQuery(scope));
  const { data: sources } = useSuspenseQuery(mySourcesQuery(scope));
  const logout = useLogout();
  return (
    <>
      <PageHeader title="Настройки" subtitle="Приватность, источники и аккаунт" />
      <div className="split-even">
        <Card title="Приватность">
          <div className="stack">
            <ConsentControls profile={profile} />
            <hr className="divider" />
            <p className="small">
              <strong>Раскрытие контактов</strong> происходит только при принятии конкретного приглашения: вы выбираете
              поля, и их получает только компания-отправитель.
            </p>
            {profile.onboarding.visibleToEmployers ? (
              <StatusChip tone="success">Профиль виден работодателям как {profile.alias}</StatusChip>
            ) : (
              <p className="small muted">
                Профиль скрыт из поиска: {profile.onboarding.blockers.map((item) => blockerLabel[item]).join(', ')}.
              </p>
            )}
          </div>
        </Card>
        <div className="stack-lg">
          <Card title="Источники">
            <div className="stack">
              <DefinitionList
                items={sources.items.map((source) => ({
                  term: source.provider === 'github' ? 'GitHub' : 'ФСП',
                  value: source.status === 'connected' ? `Подключён · ${source.accountLabel ?? ''}` : 'Не подключён',
                }))}
              />
              <p className="small muted">Отключение источника в текущей версии API не поддерживается.</p>
              <ButtonLink to="/candidate/sources">Открыть источники</ButtonLink>
            </div>
          </Card>
          <Card title="Аккаунт">
            <div className="stack">
              <DefinitionList
                items={[
                  { term: 'Email', value: profile.email },
                  { term: 'Роль', value: 'Кандидат' },
                ]}
              />
              <Button icon="logout" onClick={() => logout.mutate()} pending={logout.isPending}>
                Выйти
              </Button>
              <p className="small muted">При выходе данные этого аккаунта удаляются из памяти вкладки.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
