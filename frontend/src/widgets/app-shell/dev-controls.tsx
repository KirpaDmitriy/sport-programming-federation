import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api, type components, describeError, requireData } from '@/shared/api';
import { Button, Callout, SelectField } from '@/shared/ui';

type Actor = components['schemas']['MockSessionInput']['actor'];
type Scenario = components['schemas']['MockResetInput']['scenario'];

const actors: Array<{ value: Actor; label: string }> = [
  { value: 'candidate024', label: 'Кандидат №024 (Алексей Морозов)' },
  { value: 'candidate-new', label: 'Новый кандидат' },
  { value: 'employer-a', label: 'Север Тех' },
  { value: 'employer-b', label: 'Вторая компания' },
];

const scenarios: Array<{ value: Scenario; label: string }> = [
  { value: 'baseline', label: 'Базовый: Джуниор, цель Мидл' },
  { value: 'qualified', label: 'Мидл подтверждён' },
  { value: 'assessment_failure', label: 'Проверка не проходится' },
  { value: 'service_failure', label: 'Сбой сервиса оценивания' },
  { value: 'no_fsp', label: 'Без истории ФСП' },
  { value: 'empty_bank', label: 'Пустой банк кандидатов' },
  { value: 'api_error', label: 'Ошибка поиска (503)' },
  { value: 'new_candidate', label: 'Новый кандидат' },
];

export default function DevControls({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario>('baseline');

  const restart = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    onDone();
    await navigate({ to: '/' });
  };

  const switchActor = useMutation({
    mutationFn: async (actor: Actor) => requireData(await api.POST('/__mock__/session', { body: { actor } })),
    onSuccess: restart,
  });
  const reset = useMutation({
    mutationFn: async () => requireData(await api.POST('/__mock__/reset', { body: { scenario } })),
    onSuccess: async () => {
      queryClient.clear();
      onDone();
      await navigate({ to: '/login' });
    },
  });
  const advance = useMutation({
    mutationFn: async (advanceSeconds: number) =>
      requireData(await api.POST('/__mock__/clock', { body: { advanceSeconds } })),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const codes = useQuery({
    queryKey: ['dev', 'email-codes'],
    queryFn: async () => requireData(await api.GET('/__mock__/email-codes')),
  });
  const error = switchActor.error ?? reset.error ?? advance.error;

  return (
    <section className="stack" aria-label="Средства разработчика">
      <Callout tone="warning" title="Только для локальной разработки">
        Эти действия вызывают служебные маршруты /__mock__ и недоступны в публичной сборке.
      </Callout>
      <div className="stack">
        <strong>Войти как</strong>
        <div className="row">
          {actors.map((actor) => (
            <Button
              key={actor.value}
              size="sm"
              pending={switchActor.isPending && switchActor.variables === actor.value}
              onClick={() => switchActor.mutate(actor.value)}
            >
              {actor.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'end' }}>
        <div style={{ flex: '1 1 16rem' }}>
          <SelectField
            id="dev-scenario"
            label="Сценарий мок-сервера"
            options={scenarios}
            value={scenario}
            onValueChange={setScenario}
          />
        </div>
        <Button variant="danger" pending={reset.isPending} onClick={() => reset.mutate()}>
          Сбросить данные
        </Button>
      </div>
      <div className="row">
        <Button size="sm" pending={advance.isPending} onClick={() => advance.mutate(16 * 60)}>
          Часы мок-сервера +16 минут
        </Button>
        <Button size="sm" pending={advance.isPending} onClick={() => advance.mutate(91 * 86_400)}>
          +91 день
        </Button>
      </div>
      <details>
        <summary>Демонстрационный почтовый ящик</summary>
        <ul className="small">
          {codes.data?.items.map((item) => (
            <li key={item.challengeId}>
              {item.email}: <code>{item.code}</code> {item.used ? '(использован)' : ''}
            </li>
          ))}
        </ul>
      </details>
      {error && <Callout tone="danger">{describeError(error).message}</Callout>}
    </section>
  );
}
