import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { skillLabel, useMeta } from '@/entities/meta';
import { profileQuery } from '@/entities/profile';
import { useScope } from '@/entities/session';
import {
  isDemoReference,
  mySourcesQuery,
  type Repository,
  repositoryStatusLabel,
  type Source,
} from '@/entities/source';
import { ConnectSourceForm, useSourceProcessing } from '@/features/connect-source';
import { describeError } from '@/shared/api';
import { formatDate, formatDateTime, pluralRu, useDocumentTitle } from '@/shared/lib';
import {
  Button,
  Callout,
  Card,
  Icon,
  InlineStatus,
  PageHeader,
  Pagination,
  StatusChip,
  TableWrap,
  TagList,
  type Tone,
} from '@/shared/ui';
import styles from './sources-page.module.css';

const PAGE_SIZE = 6;
const repositoryTone: Record<Repository['status'], Tone> = {
  processed: 'success',
  queued: 'warning',
  unavailable: 'neutral',
};

function RepositoryTable({ repositories }: { repositories: Repository[] }) {
  const meta = useMeta();
  const [page, setPage] = useState(1);
  const visible = repositories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = (page - 1) * PAGE_SIZE + 1;
  return (
    <Card
      title="Репозитории"
      actions={
        <span className="small muted">
          Показаны {first}–{first + visible.length - 1} из {repositories.length}
        </span>
      }
    >
      <TableWrap label="Репозитории">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Репозиторий</th>
              <th scope="col">Технологии</th>
              <th scope="col">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((repository) => (
              <tr key={repository.id}>
                <td>
                  <strong>{repository.name}</strong>
                  <div className="small muted">
                    {isDemoReference(repository.url) ? (
                      'демо-ссылка, страница не размещена'
                    ) : (
                      <a href={repository.url} target="_blank" rel="noreferrer noopener">
                        Открыть источник
                      </a>
                    )}
                  </div>
                </td>
                <td>
                  {repository.technologies.length ? (
                    <TagList items={repository.technologies.map((id) => skillLabel(meta, id))} />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <StatusChip tone={repositoryTone[repository.status]} plain>
                    {repositoryStatusLabel[repository.status]}
                  </StatusChip>
                  {repository.status === 'unavailable' && (
                    <div className="small muted">Повторим при следующем обновлении; это не оценка навыков</div>
                  )}
                  {repository.status === 'queued' && <div className="small muted">Обработается автоматически</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={repositories.length} onChange={setPage} />
    </Card>
  );
}

type Processing = ReturnType<typeof useSourceProcessing>;

function GithubCard({ source, consent, processing }: { source: Source; consent: boolean; processing: Processing }) {
  const meta = useMeta();
  const connected = source.status === 'connected';
  return (
    <Card>
      <div className={styles.github}>
        <span className={styles.logo}>
          <Icon name="branch" size={44} />
        </span>
        <div className="stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>GitHub</h2>
            <StatusChip tone={connected ? 'success' : 'neutral'}>{connected ? 'Подключён' : 'Не подключён'}</StatusChip>
            {source.synthetic && (
              <StatusChip tone="accent" icon={null}>
                Демо-источник
              </StatusChip>
            )}
          </div>
          <p className="muted">
            Публичные данные{source.accountLabel ? ` · аккаунт «${source.accountLabel}»` : ''}. Подключение запускает
            анализ автоматически — выбирать репозитории вручную не нужно.
          </p>
          {!connected && (
            <div style={{ maxWidth: '28rem' }}>
              {consent ? (
                <ConnectSourceForm
                  provider="github"
                  label="Имя аккаунта GitHub"
                  submitLabel="Подключить GitHub"
                  hint={
                    meta.mode === 'mock'
                      ? 'Демонстрационный аккаунт'
                      : 'Для анализа требуется авторизация соответствующего аккаунта GitHub.'
                  }
                />
              ) : (
                <Callout tone="neutral">Подключение доступно после согласия на обработку данных.</Callout>
              )}
            </div>
          )}
          {connected && (
            <>
              <dl className={styles.stats} aria-label="Покрытие репозиториев">
                <div className={`${styles.stat} ${styles.total}`}>
                  <dt>найдено всего</dt>
                  <dd>{source.counts.found}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>из них обработано</dt>
                  <dd>{source.counts.processed}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>в очереди</dt>
                  <dd>{source.counts.queued}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>недоступно</dt>
                  <dd>{source.counts.unavailable}</dd>
                </div>
              </dl>
              {processing.processing ? (
                <InlineStatus>Анализ продолжается автоматически. Уже найденные данные доступны.</InlineStatus>
              ) : (
                source.lastSyncedAt && <p className="small muted">Обновлено {formatDateTime(source.lastSyncedAt)}</p>
              )}
              {processing.lastFailure && (
                <Callout
                  tone="warning"
                  title="Обработка не завершилась"
                  actions={
                    processing.lastFailure.retryable && (
                      <Button
                        size="sm"
                        icon="refresh"
                        onClick={() => processing.sync.mutate()}
                        pending={processing.sync.isPending}
                      >
                        Повторить
                      </Button>
                    )
                  }
                >
                  {processing.lastFailure.message}. Ранее найденные данные сохранены.
                </Callout>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function FspCard({ source, consent }: { source: Source; consent: boolean }) {
  const processing = useSourceProcessing(source);
  const [editing, setEditing] = useState(false);
  const connected = source.status === 'connected';

  return (
    <Card
      title="ФСП"
      actions={
        <StatusChip tone="accent" icon={null}>
          Демо-источник
        </StatusChip>
      }
    >
      <div className="stack">
        {!connected && !editing && (
          <>
            <p>
              <strong>Не подключена.</strong> Можно добавить достижения участника соревнований.
            </p>
            <Button variant="primary" onClick={() => setEditing(true)} disabled={!consent}>
              Указать ФСП ID
            </Button>
          </>
        )}
        {editing && (
          <ConnectSourceForm
            provider="fsp"
            label="ФСП ID"
            submitLabel="Подключить"
            hint="Вымышленные ID: FSP-DEMO-024 — результат команды; FSP-DEMO-031 — команда и личный зачёт; FSP-DEMO-PENDING — ждёт протокола; FSP-DEMO-EMPTY — пустая история."
            onConnected={() => setEditing(false)}
          />
        )}
        {connected && processing.processing && <InlineStatus>Ищем историю участия…</InlineStatus>}
        {connected && !processing.processing && processing.lastFailure && (
          <Callout tone="warning" title="Сервис ФСП временно недоступен">
            {processing.lastFailure.message}. Это не означает отсутствие истории.
          </Callout>
        )}
        {connected && (
          <>
            <p>
              <strong>Подключена</strong>
              {source.accountLabel ? ` · ${source.accountLabel}` : ''}
            </p>
            {source.verifiedParticipation && <StatusChip tone="success">Подтверждённое участие</StatusChip>}
            {(source.fspResults ?? []).length > 0 ? (
              <ul className="stack" style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {(source.fspResults ?? []).map((result) => (
                  <li key={result.competitionId} className="stack" style={{ gap: '0.375rem' }}>
                    <strong>{result.competitionName}</strong>
                    <span className="small">
                      {result.discipline} · {formatDate(result.startsAt)} — {formatDate(result.endsAt)}
                    </span>
                    <span>
                      {result.scope === 'team'
                        ? `Командный зачёт: ${result.teamName}, ${result.teamSize} ${pluralRu(result.teamSize ?? 0, 'участник', 'участника', 'участников')}`
                        : 'Личный зачёт'}
                    </span>
                    <StatusChip
                      tone={
                        result.status === 'published' ? 'success' : result.status === 'pending' ? 'info' : 'warning'
                      }
                    >
                      {result.status === 'published'
                        ? `Место ${result.place} из ${result.fieldSize} · ${result.score} ${pluralRu(result.score ?? 0, 'балл', 'балла', 'баллов')}`
                        : result.status === 'pending'
                          ? 'Протокол ещё не опубликован'
                          : 'Дисквалификация в демонстрационном сценарии'}
                    </StatusChip>
                    {result.protocolReference && (
                      <span className="small muted">
                        Протокол {result.protocolReference} · {result.publishedAt && formatDate(result.publishedAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : source.verifiedParticipation ? (
              <Callout tone="neutral">
                Сохранено участие из прежней демонстрационной версии. Нажмите «Обновить ФСП», чтобы получить подробный
                результат.
              </Callout>
            ) : (
              <Callout tone="neutral" title="Истории ФСП нет">
                Это нормально: профиль, проверка и подбор работают без неё.
              </Callout>
            )}
            {source.lastSyncedAt && <p className="small muted">Обновлено {formatDateTime(source.lastSyncedAt)}</p>}
          </>
        )}
        {connected && (
          <div className="row">
            <Button
              icon="refresh"
              onClick={() => processing.sync.mutate()}
              pending={processing.sync.isPending}
              disabled={processing.processing || !consent}
            >
              Обновить ФСП
            </Button>
            <Button
              onClick={() => setEditing((value) => !value)}
              disabled={processing.processing || processing.sync.isPending || !consent}
            >
              {editing ? 'Скрыть форму' : 'Изменить ФСП ID'}
            </Button>
          </div>
        )}
        {processing.sync.error && <Callout tone="warning">{describeError(processing.sync.error).message}</Callout>}
        <p className="small muted" style={{ display: 'flex', gap: '0.5rem' }}>
          <Icon name="info" size={18} />
          {source.notice}
        </p>
      </div>
    </Card>
  );
}

function ObservationCard({ github }: { github: Source | undefined }) {
  return (
    <Card title="Что учитываем">
      <ul className={styles.facts}>
        <li>
          <Icon name="branch" />
          <span>
            Вклад, связанный с подключённым аккаунтом. Технология в репозитории сама по себе не доказывает личный навык.
          </span>
        </li>
        <li>
          <Icon name="calendar" />
          <span>Активные дни: {github?.activeDays ?? 'нет данных'}</span>
        </li>
        <li>
          <Icon name="clock" />
          <span>
            Период наблюдений:{' '}
            {github?.observationPeriod
              ? `${formatDate(github.observationPeriod.from)} — ${formatDate(github.observationPeriod.to)}`
              : 'нет данных'}
          </span>
        </li>
        <li>
          <Icon name="info" />
          <span>Часы работы по GitHub не измеряются и не используются в оценке.</span>
        </li>
      </ul>
    </Card>
  );
}

export function CandidateSourcesPage() {
  useDocumentTitle('Источники профиля');
  const scope = useScope();
  const { data: sources } = useSuspenseQuery(mySourcesQuery(scope));
  const { data: profile } = useSuspenseQuery(profileQuery(scope));
  const github = sources.items.find((item) => item.provider === 'github');
  const fsp = sources.items.find((item) => item.provider === 'fsp');
  const sync = useSourceProcessing(github);
  const consent = profile.consents.processing;

  return (
    <>
      <PageHeader
        title="Источники профиля"
        subtitle="Профиль дополняется находками из открытых источников"
        actions={
          github?.status === 'connected' && (
            <Button
              icon="refresh"
              onClick={() => sync.sync.mutate()}
              pending={sync.sync.isPending}
              disabled={sync.processing || !consent}
              title={sync.processing ? 'Анализ уже идёт' : undefined}
            >
              Обновить
            </Button>
          )
        }
      />
      {sources.simulation && (
        <Callout tone="info" title="Синтетические данные">
          Некоторые источники содержат вымышленные данные и помечены отдельно. ФСП предоставляется демонстрационным
          сервисом; официальный реестр не подключён.
        </Callout>
      )}
      {sync.sync.error && (
        <Callout tone="danger" role="alert">
          Не удалось запустить обновление: {describeError(sync.sync.error).message}
        </Callout>
      )}
      <div className="stack-lg" style={{ marginTop: '1.5rem' }}>
        {github && <GithubCard source={github} consent={consent} processing={sync} />}
      </div>
      <div className={styles.grid}>
        <div className="stack-lg">
          {github?.status === 'connected' && github.repositories.length > 0 && (
            <RepositoryTable repositories={github.repositories} />
          )}
          {github?.status === 'connected' && github.repositories.length === 0 && (
            <Card title="Репозитории">
              <p className="muted">Публичных репозиториев не найдено. Профиль остаётся рабочим без них.</p>
            </Card>
          )}
        </div>
        <div className="stack-lg">
          {fsp && <FspCard key={fsp.accountLabel} source={fsp} consent={consent} />}
          <ObservationCard github={github} />
        </div>
      </div>
    </>
  );
}
