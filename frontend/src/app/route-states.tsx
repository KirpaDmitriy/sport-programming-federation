import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { describeError, isApiError } from '@/shared/api';
import { Button, ButtonLink, LoadingState } from '@/shared/ui';
import { homeFor, RoleMismatchError } from './guards';
import styles from './route-states.module.css';

export function RoutePending() {
  return (
    <div className={styles.pending}>
      <LoadingState label="Открываем страницу…" />
    </div>
  );
}

export function RouteNotFound() {
  return (
    <main className={styles.page} id="main">
      <div className={styles.panel}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>Страница не найдена</h1>
        <p className="muted">Проверьте адрес или вернитесь в свой кабинет.</p>
        <ButtonLink to="/" variant="primary">
          На главную
        </ButtonLink>
      </div>
    </main>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (error instanceof RoleMismatchError) {
    return (
      <main className={styles.page} id="main">
        <div className={styles.panel}>
          <p className={styles.code}>403</p>
          <h1 className={styles.title}>Раздел недоступен</h1>
          <p className="muted">
            Вы вошли как {error.actualRole === 'candidate' ? 'кандидат' : 'работодатель'}. Этот раздел относится к
            другой роли, а сменить роль существующего аккаунта нельзя.
          </p>
          <ButtonLink to={homeFor(error.actualRole)} variant="primary">
            Вернуться в свой кабинет
          </ButtonLink>
        </div>
      </main>
    );
  }
  const description = describeError(error);
  return (
    <main className={styles.page} id="main">
      <div className={styles.panel}>
        <p className={styles.code}>{isApiError(error) ? error.status : '!'}</p>
        <h1 className={styles.title}>{description.title}</h1>
        <p className="muted">{description.message}</p>
        {description.requestId && <p className="small muted">Код запроса: {description.requestId}</p>}
        <div className="row">
          <Button
            variant="primary"
            icon="refresh"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Повторить
          </Button>
          <ButtonLink to="/">На главную</ButtonLink>
        </div>
      </div>
    </main>
  );
}
