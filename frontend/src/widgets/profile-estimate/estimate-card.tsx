import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { useMeta } from '@/entities/meta';
import { type Profile, type ProfileEstimate, profileQuery } from '@/entities/profile';
import { CategoryBadge, estimateConfidenceLabel } from '@/entities/qualification';
import { useScope } from '@/entities/session';
import { mySourcesQuery } from '@/entities/source';
import { useSourceProcessing } from '@/features/connect-source';
import { RebuildProfileButton, useRefreshEstimate } from '@/features/refresh-estimate';
import { describeError } from '@/shared/api';
import { formatDateTime, gradeLabel, specializationName } from '@/shared/lib';
import { Button, ButtonLink, Callout, Card, EmptyState, InlineStatus, StatusChip } from '@/shared/ui';
import styles from './estimate-card.module.css';

const sourceLabel: Record<ProfileEstimate['sources'][number], string> = { github: 'GitHub', fsp: 'ФСП' };

const share = (value: number) => ({ '--value': String(value) }) as CSSProperties;

/** How long after an estimate its background LLM review is awaited. */
const REVIEW_WAIT_MS = 2 * 60_000;

/** Grade bands of the seniority score, as `estimate-v3` defines them. */
const BANDS = 'до 20 — стажёр, 20–39 — джуниор, 40–59 — мидл, 60–79 — сеньор, от 80 — лид';

function Bars({ items }: { items: { id: string; label: string; value: number; max: number; detail?: string }[] }) {
  return (
    <ul className={styles.bars}>
      {items.map((item) => (
        <li key={item.id}>
          <div className={styles.barHead}>
            <span>{item.label}</span>
            <span className={styles.value}>
              {item.value}
              <span className="small muted"> / {item.max}</span>
            </span>
          </div>
          <div className={styles.bar} aria-hidden="true">
            <span className={styles.barFill} style={share(item.max ? (item.value / item.max) * 100 : 0)} />
          </div>
          {item.detail && <span className="small muted">{item.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  profile: Profile;
  /** Whether a finished source exists, so the estimate can be computed now. */
  canEstimate: boolean;
  title?: string;
};

/**
 * The automatic estimate: the category it gives, the seniority score with every factor, the
 * leading specializations and the LLM's second opinion, with recalculation and the optional test.
 */
export function ProfileEstimateCard({ profile, canEstimate, title = 'Автоматическая оценка' }: Props) {
  const refresh = useRefreshEstimate();
  const scope = useScope();
  const meta = useMeta();
  const estimate = profile.estimate;
  // The server reviews a fresh estimate in the background; refetch until the review arrives.
  const reviewPending = Boolean(
    meta.capabilities.realLlm &&
      estimate?.grade &&
      !estimate.review &&
      Date.now() - Date.parse(estimate.computedAt) < REVIEW_WAIT_MS,
  );
  useQuery({ ...profileQuery(scope), refetchInterval: reviewPending ? 4_000 : false });
  // A recalculation may re-analyze an outdated GitHub report; its job applies the new estimate.
  const sources = useQuery(mySourcesQuery(scope));
  const analyzing = sources.data?.items.find((item) => item.provider === 'github' && item.activeJobId);
  const analysis = useSourceProcessing(analyzing);
  const recalculate = (
    <Button
      size="sm"
      icon="refresh"
      onClick={() => refresh.mutate('keep')}
      pending={refresh.isPending}
      pendingLabel="Оцениваем…"
      disabled={!canEstimate || !profile.consents.processing}
    >
      {estimate ? 'Пересчитать' : 'Оценить профиль'}
    </Button>
  );

  if (!estimate) {
    return (
      <Card title={title}>
        <EmptyState
          icon="sparkles"
          title={canEstimate ? 'Профиль ещё не оценён' : 'Подключите GitHub или ФСП'}
          actions={
            canEstimate ? (
              recalculate
            ) : (
              <ButtonLink to="/candidate/sources" variant="primary" iconAfter="arrowRight">
                Подключить источники
              </ButtonLink>
            )
          }
        >
          Система сама заполнит анкету и оценит специализацию и грейд по публичной работе и результатам соревнований.
          Анкету можно заполнить и вручную.
        </EmptyState>
        {refresh.error && <Callout tone="danger">{describeError(refresh.error).message}</Callout>}
      </Card>
    );
  }

  const estimated = profile.category.source === 'estimate';
  const confirmed = profile.category.source === 'assessment';
  return (
    <Card
      title={title}
      subtitle={`Рассчитано ${formatDateTime(estimate.computedAt)} · ${estimate.sources.map((item) => sourceLabel[item]).join(' и ') || 'нет данных'}`}
      actions={
        <div className="row">
          <RebuildProfileButton disabled={!canEstimate || !profile.consents.processing} />
          {recalculate}
        </div>
      }
    >
      <div className="stack">
        <div className="row">
          <CategoryBadge {...profile.category} />
          {estimate.grade && !estimated && (
            <StatusChip tone="neutral" icon="chart">
              Оценка: {estimate.specialization ? `${specializationName[estimate.specialization]} · ` : ''}
              {gradeLabel[estimate.grade]}, {estimateConfidenceLabel[estimate.confidence]}
            </StatusChip>
          )}
        </div>
        {estimate.insufficient && <Callout tone="neutral">{estimate.insufficient}</Callout>}
        {!estimate.insufficient && !estimated && !confirmed && (
          <Callout tone="neutral">
            Уверенность оценки пока низкая, поэтому категория не присвоена. Добавьте источник или пройдите тест.
          </Callout>
        )}
        <div className={styles.summary}>
          <div className={styles.score} style={{ '--score': String(estimate.score) } as CSSProperties}>
            <span className={styles.scoreValue}>
              <span aria-hidden="true">{estimate.score}</span>
              <span className="visually-hidden">Балл уровня {estimate.score} из 100</span>
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Балл уровня из 100 по факторам ниже: {BANDS}. Сеньору нужно не меньше двух лет опыта, лиду — четырёх: по
            публичной работе или по анкете. Стаж из анкеты никогда не снижает оценку. Объём коммитов сам по себе грейд
            не повышает.
          </p>
        </div>
        {analysis.processing && (
          <InlineStatus>Обновляем анализ GitHub — оценка пересчитается, когда он закончится…</InlineStatus>
        )}
        {estimate.notes.length > 0 && (
          <Callout tone="neutral" title="Почему такой уровень">
            <ul className={styles.notes}>
              {estimate.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Callout>
        )}
        {estimate.specializations.length > 0 && (
          <section className="stack" aria-label="Направления">
            <h3 className={styles.heading}>Направления</h3>
            <Bars
              items={estimate.specializations.map((item) => ({
                id: item.id,
                label: specializationName[item.id],
                value: item.percent,
                max: 100,
              }))}
            />
          </section>
        )}
        {estimate.factors.length > 0 && (
          <section className="stack" aria-label="Факторы уровня">
            <h3 className={styles.heading}>Из чего складывается балл</h3>
            <Bars
              items={estimate.factors.map((factor) => ({
                id: factor.id,
                label: factor.label,
                value: factor.points,
                max: factor.max,
                detail: factor.detail,
              }))}
            />
          </section>
        )}
        {reviewPending && <InlineStatus>ИИ готовит второе мнение об оценке…</InlineStatus>}
        {estimate.review && (
          <Callout tone={estimate.review.agrees ? 'success' : 'warning'} title="Второе мнение ИИ">
            {estimate.review.agrees
              ? `Согласен с грейдом «${gradeLabel[estimate.review.grade]}».`
              : `Оценивает грейд как «${gradeLabel[estimate.review.grade]}», поэтому уверенность снижена. Грейд по правилам не меняется.`}
            {estimate.review.rationale && ` ${estimate.review.rationale}`}
          </Callout>
        )}
        {estimated && (
          <div className={styles.confirm}>
            <span className="small">
              Тест знаний подтверждает категорию: подтверждённые кандидаты стоят выше в выдаче работодателям.
            </span>
            <ButtonLink to="/candidate/assessments" size="sm" iconAfter="arrowRight">
              Подтвердить тестом
            </ButtonLink>
          </div>
        )}
        {refresh.error && <Callout tone="danger">{describeError(refresh.error).message}</Callout>}
      </div>
    </Card>
  );
}
