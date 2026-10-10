import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useMeta } from '@/entities/meta';
import { eligibilityReasonText, profileQuery } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { mySourcesQuery, type Source } from '@/entities/source';
import { ConnectSourceForm } from '@/features/connect-source';
import { ConsentControls } from '@/features/consents';
import { ProfileForm } from '@/features/edit-profile';
import { ImportProfileDialog } from '@/features/profile-pdf';
import { useStartAssessment } from '@/features/start-assessment';
import { describeError } from '@/shared/api';
import { gradeLabel, specializationLabel, useDocumentTitle } from '@/shared/lib';
import { Button, ButtonLink, Callout, Card, Icon, PageHeader } from '@/shared/ui';
import styles from './onboarding-page.module.css';

function Step({ index, done, title, children }: { index: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className={styles.step}>
      <span className={`${styles.marker} ${done ? styles.done : ''}`} aria-hidden="true">
        {done ? <Icon name="check" /> : index}
      </span>
      <Card title={title} subtitle={done ? 'Готово' : undefined}>
        {children}
      </Card>
    </li>
  );
}

/** GitHub can be added right here; the full report and FSP live on the sources page. */
function SourcesStep({ consent, github, failed }: { consent: boolean; github: Source | undefined; failed: boolean }) {
  const connected = github?.status === 'connected';
  return (
    <div className="stack">
      <p className="muted">
        GitHub покажет вашу публичную работу: языки, стек, главные проекты и регулярность. Анализ идёт на нашем сервере
        в фоне несколько минут, токен не нужен. ФСП ID тоже можно указать позже. Без источников проверка и подбор
        работают полностью.
      </p>
      {failed && (
        <Callout tone="warning">
          Не удалось загрузить источники. Подключить GitHub можно на странице источников.
        </Callout>
      )}
      {connected ? (
        <p className="row" style={{ margin: 0 }}>
          <Icon name={github.activeJobId ? 'refresh' : 'checkCircle'} />
          GitHub «{github.accountLabel}» подключён{github.activeJobId ? ', идёт анализ' : ''}.
        </p>
      ) : consent ? (
        <div style={{ maxWidth: '32rem' }}>
          <ConnectSourceForm
            provider="github"
            label="Ник или ссылка на профиль GitHub"
            placeholder="octocat или https://github.com/octocat"
            submitLabel="Подключить GitHub"
            hint="Например: octocat, @octocat или https://github.com/octocat."
          />
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Подключение GitHub доступно после согласия на обработку данных.
        </p>
      )}
      <div>
        <ButtonLink to="/candidate/sources" iconAfter="arrowRight">
          {connected ? 'Открыть отчёт GitHub' : 'Перейти к источникам'}
        </ButtonLink>
      </div>
    </div>
  );
}

export function CandidateOnboardingPage() {
  useDocumentTitle('Анкета кандидата');
  const scope = useScope();
  const meta = useMeta();
  const { data: profile } = useSuspenseQuery(profileQuery(scope));
  const sources = useQuery(mySourcesQuery(scope));
  const github = sources.data?.items.find((item) => item.provider === 'github');
  const githubConnected = github?.status === 'connected';
  const [importOpen, setImportOpen] = useState(false);
  const start = useStartAssessment();
  const eligibility = profile.assessmentEligibility;
  const form = profile.onboarding;

  return (
    <>
      <PageHeader
        title="Анкета кандидата"
        subtitle="Отрасль, специализация и выбранный грейд нужны, чтобы назначить проверку. Категория для работодателей появится только после её прохождения."
      />
      <ol className={styles.steps}>
        <Step index={1} done={form.emailVerified} title="Почта подтверждена">
          <p className="muted">
            {profile.email}. Адрес используется для входа; работодатели увидят его, только если вы сами откроете
            контакты в ответ на приглашение.
          </p>
        </Step>
        <Step index={2} done={profile.consents.processing} title="Согласия">
          <ConsentControls profile={profile} />
        </Step>
        <Step index={3} done={form.questionnaireComplete} title="Анкета">
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="muted">
                Заполните поля вручную или загрузите резюме в PDF и проверьте распознанные данные.
              </p>
              {meta.capabilities.profilePdfImport && (
                <Button icon="upload" onClick={() => setImportOpen(true)} disabled={!profile.consents.processing}>
                  Заполнить из PDF
                </Button>
              )}
            </div>
            {!profile.consents.processing && (
              <p className="small muted">Импорт резюме доступен после согласия на обработку данных.</p>
            )}
            <ProfileForm profile={profile} submitLabel="Сохранить анкету" />
          </div>
        </Step>
        <Step index={4} done={githubConnected} title="Источники — по желанию">
          <SourcesStep consent={profile.consents.processing} github={github} failed={sources.isError} />
        </Step>
        <Step index={5} done={form.assessmentPassed} title="Проверка уровня">
          {form.assessmentPassed ? (
            <div className="row">
              <p>Уровень подтверждён.</p>
              <ButtonLink to="/candidate/overview" variant="primary">
                Открыть профиль
              </ButtonLink>
            </div>
          ) : eligibility.canStartSelected ? (
            <div className="stack">
              <p>
                Цель проверки: {specializationLabel[eligibility.selectedSpecialization]} ·{' '}
                {gradeLabel[eligibility.selectedGrade]}. ИИ разрешён на всех этапах, включая внешние инструменты.
              </p>
              <div className="row">
                <Button
                  variant="primary"
                  iconAfter="arrowRight"
                  pending={start.isPending}
                  onClick={() =>
                    start.mutate({
                      specialization: eligibility.selectedSpecialization,
                      grade: eligibility.selectedGrade,
                    })
                  }
                >
                  Подтвердить уровень
                </Button>
                <ButtonLink to="/candidate/assessments">Как устроена проверка</ButtonLink>
              </div>
              {start.error && <Callout tone="danger">{describeError(start.error).message}</Callout>}
            </div>
          ) : (
            <Callout tone="neutral">
              {eligibility.selectedReason
                ? eligibilityReasonText[eligibility.selectedReason]
                : 'Проверка пока недоступна.'}
            </Callout>
          )}
        </Step>
      </ol>
      <ImportProfileDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
