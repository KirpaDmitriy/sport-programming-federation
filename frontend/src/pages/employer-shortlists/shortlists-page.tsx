import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useScope } from '@/entities/session';
import { shortlistsQuery } from '@/entities/shortlist';
import { CreateShortlistDialog } from '@/features/shortlist-membership';
import { formatDate, pluralRu, useDocumentTitle } from '@/shared/lib';
import { Button, Card, EmptyState, PageHeader, TableWrap } from '@/shared/ui';

export function EmployerShortlistsPage() {
  useDocumentTitle('Подборки');
  const scope = useScope();
  const { data } = useSuspenseQuery(shortlistsQuery(scope));
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Подборки"
        subtitle="Сохранённые кандидаты компании. Подборки не зависят от фильтров поиска."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Создать подборку
          </Button>
        }
      />
      {data.items.length === 0 ? (
        <Card>
          <EmptyState icon="folder" title="Подборок пока нет">
            Создайте подборку и добавляйте в неё кандидатов из поиска.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <TableWrap label="Подборки">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Название</th>
                  <th scope="col">Кандидатов</th>
                  <th scope="col">Обновлена</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to="/employer/shortlists/$shortlistId" params={{ shortlistId: item.id }}>
                        <strong>{item.title}</strong>
                      </Link>
                    </td>
                    <td>
                      {item.count} {pluralRu(item.count, 'кандидат', 'кандидата', 'кандидатов')}
                    </td>
                    <td>{formatDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      <CreateShortlistDialog open={creating} onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />
    </>
  );
}
