# Развёртывание

## Целевая схема

«Выготский» запускается под сохранённым техническим unit `kontur-talent.service`:

- код: `/opt/kontur-talent`;
- виртуальное окружение: `/opt/kontur-talent/.venv`;
- данные: `/var/lib/kontur-talent/kontur.sqlite3`;
- HTTP: `0.0.0.0:8010`;
- один worker, CPU-only.

## Переменные эксплуатации

- `VYGOTSKY_DATABASE` — путь к SQLite;
- `VYGOTSKY_COOKIE_SECURE=1` — только при публикации за HTTPS;
- `VYGOTSKY_INTEGRATION_KEY` — длинный случайный ключ импорта ФСП;
- `VYGOTSKY_DEMO_AUTH=1` — прозрачный demo-outbox для стенда;
- `VYGOTSKY_DEMO_AUTH=0` и `VYGOTSKY_SMTP_*` — настоящая email-доставка.

Секреты задаются через отдельный root-readable `EnvironmentFile` systemd и не
попадают в репозиторий. Техническое имя unit сохранено ради безопасного обновления;
пользовательское название сервиса везде — «Выготский».

Сервис не использует `/opt/metroguard`, порт `8000`, `metroguard.service`,
`/var/lib/metroguard`, конфигурацию Nginx или сертификаты.

## Перед установкой

Сначала подтвердить, что существующий продукт здоров:

```bash
sudo systemctl status metroguard --no-pager
sudo systemctl status nginx --no-pager
curl http://127.0.0.1:8000/api/config
curl -I https://93-77-179-211.nip.io
sudo journalctl -u metroguard -n 100 --no-pager
```

Затем проверить, что порт свободен: `ss -ltn | grep ':8010 '`. Если внешний
firewall ВМ не разрешает TCP/8010, правило меняется только после отдельного
согласования. Nginx нельзя использовать как обход этого ограничения.

## Установка из release-каталога

Передать архив без `.git`, `.venv`, локальной БД и SSH-ключей, распаковать во
временный каталог, затем выполнить:

```bash
./deploy/install.sh
./deploy/smoke.sh
./deploy/smoke.sh http://93.77.179.211:8010
```

Публичный адрес после открытия порта: <http://93.77.179.211:8010>. OpenAPI:
<http://93.77.179.211:8010/docs>.

## Обновление и откат

Перед обновлением сохранить архив текущего `/opt/kontur-talent` и копию
`/var/lib/kontur-talent/kontur.sqlite3`. `install.sh` не удаляет данные и не
использует `rsync --delete`. Откат выполняется восстановлением только каталога
`/opt/kontur-talent` и перезапуском `kontur-talent.service`; MetroGuard в этот
процесс не входит.
