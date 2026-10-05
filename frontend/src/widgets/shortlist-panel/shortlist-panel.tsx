import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { aliasShape } from '@/entities/candidate';
import type { ShortlistSummary } from '@/entities/shortlist';
import { CreateShortlistDialog, type useShortlistMembership } from '@/features/shortlist-membership';
import { describeError } from '@/shared/api';
import { pluralRu } from '@/shared/lib';
import { Button, ButtonLink, Callout, Card, Icon, InlineStatus, SelectField } from '@/shared/ui';
import styles from './shortlist-panel.module.css';

type Props = {
  shortlists: ShortlistSummary[];
  selectedId: string | null;
  onSelect: (shortlistId: string) => void;
  membership: ReturnType<typeof useShortlistMembership>;
  needId: string | undefined;
};

export function ShortlistPanel({ shortlists, selectedId, onSelect, membership, needId }: Props) {
  const [creating, setCreating] = useState(false);
  const shortlist = membership.shortlist.data;
  const members = shortlist?.members ?? [];
  return (
    <Card
      as="aside"
      aria-label="Сохранённая подборка"
      title={shortlist ? `Подборка «${shortlist.title}»` : 'Подборка'}
      subtitle={
        shortlist
          ? `${members.length} ${pluralRu(members.length, 'кандидат', 'кандидата', 'кандидатов')} · сохранено на сервере`
          : undefined
      }
    >
      <div className="stack">
        {shortlists.length > 1 && (
          <SelectField
            id="shortlist-select"
            label="Активная подборка"
            value={selectedId ?? ''}
            onValueChange={onSelect}
            options={shortlists.map((item) => ({ value: item.id, label: `${item.title} (${item.count})` }))}
          />
        )}
        <p className={styles.note}>
          <Icon name="info" size={18} />
          Подборка сохраняется при изменении фильтров и потребности.
        </p>
        {shortlists.length === 0 && (
          <p className="muted">Подборок пока нет. Создайте первую, чтобы сохранять кандидатов.</p>
        )}
        {membership.shortlist.isPending && selectedId && <InlineStatus>Загружаем подборку…</InlineStatus>}
        {membership.shortlist.isError && (
          <Callout tone="danger">{describeError(membership.shortlist.error).message}</Callout>
        )}
        {membership.toggle.error && (
          <Callout tone="danger" role="alert">
            Изменение подборки не сохранено: {describeError(membership.toggle.error).message}
          </Callout>
        )}
        {shortlist && members.length === 0 && <p className="small muted">В подборке пока никого нет.</p>}
        {members.length > 0 && (
          <ul className={styles.members}>
            {members.map((member) => (
              <li key={member.candidateId} className={styles.member}>
                <span className={styles.shape} aria-hidden="true">
                  {aliasShape(member.alias)}
                </span>
                <span className="stack" style={{ gap: 0 }}>
                  {member.available ? (
                    <Link
                      to="/employer/candidates/$candidateId"
                      params={{ candidateId: member.candidateId }}
                      search={needId ? { needId } : {}}
                    >
                      {member.alias}
                    </Link>
                  ) : (
                    <strong>{member.alias}</strong>
                  )}
                  <span className="small muted">
                    {member.available ? 'Профиль доступен' : 'Профиль сейчас недоступен'}
                  </span>
                </span>
                <Button
                  variant="quiet"
                  icon="x"
                  aria-label={`Удалить ${member.alias} из подборки`}
                  disabled={membership.toggle.isPending}
                  onClick={() =>
                    membership.toggle.mutate({ candidateId: member.candidateId, alias: member.alias, member: true })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {selectedId && (
          <ButtonLink
            to="/employer/shortlists/$shortlistId"
            params={{ shortlistId: selectedId }}
            variant="primary"
            iconAfter="arrowRight"
            block
          >
            Открыть подборку
          </ButtonLink>
        )}
        <Button block onClick={() => setCreating(true)}>
          Создать подборку
        </Button>
      </div>
      <CreateShortlistDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          onSelect(created.id);
        }}
      />
    </Card>
  );
}
