import { lazy, Suspense, useState } from 'react';
import { Dialog, InlineStatus } from '@/shared/ui';
import styles from './app-shell.module.css';

// Mock controls exist only in local development; the production bundle drops this import entirely.
const DevControls = import.meta.env.DEV ? lazy(() => import('./dev-controls')) : null;

export function DemoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.demoButton} onClick={() => setOpen(true)}>
        Демо
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Демонстрационный стенд" wide={Boolean(DevControls)}>
        <div className="stack">
          <p>
            Интерфейс работает с демонстрационным API. Все профили, компании, репозитории и достижения ФСП —
            синтетические.
          </p>
          <ul className="stack small" style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>Письма не отправляются: код подтверждения попадает в демонстрационный почтовый ящик.</li>
            <li>
              Анализ GitHub и ответы ИИ-помощника здесь подготовлены заранее. Тесты знаний оцениваются по фиксированным
              правильным ответам.
            </li>
            <li>Результаты показывают работу интерфейса и правил доступа, но не измеряют реальную квалификацию.</li>
          </ul>
          {DevControls && (
            <Suspense fallback={<InlineStatus>Загружаем средства разработчика…</InlineStatus>}>
              <DevControls onDone={() => setOpen(false)} />
            </Suspense>
          )}
        </div>
      </Dialog>
    </>
  );
}
