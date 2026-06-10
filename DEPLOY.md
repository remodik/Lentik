# Lentik — деплой и эксплуатация

Runbook для прод-развёртывания.

## 1. Конфигурация (env)

| Переменная | Прод | Назначение |
|---|---|---|
| `IS_PRODUCTION` | `true` | Secure-cookie; небезопасный CORS валит старт |
| `JWT_SECRET` | ≥32 симв. из секрет-стора | подпись JWT |
| `DATABASE_URL` | управляемый Postgres | БД |
| `CORS_ORIGINS` | только `https://`-origin фронта, без `*`/localhost | CORS |
| `AUTO_MIGRATE` | `false` | миграции — отдельным шагом (см. §2) |
| `SCHEDULER_ENABLED` | `true` на одном наборе инстансов | планировщик напоминаний |
| `REDIS_URL` | задать при ≥2 инстансах | общий WS fan-out + rate-limit |
| `STORAGE_BACKEND` | `s3` при ≥2 инстансах | хранилище загрузок |
| `S3_BUCKET` / `S3_ENDPOINT_URL` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | при `s3` | параметры бакета |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | задать для web-push | уведомления вне приложения (напоминания/события/капсулы). Пусто → только WS |
| `VAPID_SUBJECT` | `mailto:you@domain` | контакт в VAPID-claims |

> При `IS_PRODUCTION=true` приложение **падает на старте**, если `CORS_ORIGINS`
> содержит `http://`/localhost (см. `main.py::_check_security_config`).

## 2. Миграции
Не полагайтесь на авто-миграцию в проде (`AUTO_MIGRATE=false`). Применяйте **один раз**
перед запуском реплик, отдельным шагом деплоя / init-контейнером:

```bash
cd services/api && alembic upgrade heads
```

Приложение на старте лишь **проверяет** дрейф (при `STRICT_MIGRATIONS=true` — падает,
если БД не на head).

## 3. Запуск за reverse-proxy
- Пример заголовков и проксирования: [`infra/nginx.example.conf`](infra/nginx.example.conf)
  (TLS, CSP/`X-Frame-Options` для страниц фронта, WebSocket upgrade).
- **Важно (per-IP лимиты):** за прокси `request.client.host` = IP прокси, поэтому
  per-IP rate-limit/throttle станут глобальными. Запускайте uvicorn с доверием к
  forwarded-заголовкам:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port 8000 \
      --proxy-headers --forwarded-allow-ips="<ip_прокси>"
  ```

## 4. Масштабирование (>1 инстанса)
Обязательно перед горизонтальным масштабированием:
- **`REDIS_URL`** — иначе WS-сообщения не пересекают границу инстанса, а
  rate-лимитеры считаются раздельно.
- **`STORAGE_BACKEND=s3`** — иначе загрузки видны только инстансу, куда залились.
- **Планировщик** идемпотентен (`SELECT … FOR UPDATE SKIP LOCKED`), несколько
  включённых инстансов безопасны; можно вынести в отдельный worker и выключить
  `SCHEDULER_ENABLED` на web-инстансах.

## 5. Бэкапы (шифрованные)

В `docker-compose` есть сайдкар-сервис **`backup`** ([`infra/backup/`](infra/backup/)):
снимает дамп Postgres (`pg_dump -Fc`) + архив загрузок, упаковывает в один tar и
**шифрует симметрично GPG AES-256** (с MDC-целостностью). Открытые бэкапы не пишутся
никогда — без `BACKUP_ENCRYPTION_KEY` контейнер падает на старте (fail-fast).

**Конфигурация (env):**

| Переменная | Деф. | Назначение |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | — (обязателен) | пароль AES-256. Генерация: `openssl rand -base64 48`. **Храните отдельно от бэкапов** — без него восстановление невозможно |
| `BACKUP_INTERVAL_HOURS` | `24` | период между бэкапами |
| `BACKUP_RETENTION_DAILY` | `7` | сколько ежедневных хранить |
| `BACKUP_RETENTION_WEEKLY` | `4` | сколько воскресных (weekly) хранить |
| `BACKUP_S3_BUCKET` / `BACKUP_S3_ENDPOINT` / `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` / `BACKUP_S3_REGION` | — | опциональный offsite в S3/MinIO/R2 (пусто = выключено) |

Артефакты: `lentik-backup-<ts>-{daily,weekly}.tar.gpg` в томе `lentik_backups`
(+ копия в S3, если настроен). Внутри — `db.dump`, `uploads.tar.gz`, `manifest.txt`.

**Разовый прогон / восстановление:**
```bash
docker compose run --rm backup backup.sh once          # сделать бэкап сейчас
docker compose run --rm backup ls /backups             # список архивов
docker compose run --rm backup restore.sh lentik-backup-<ts>-daily.tar.gpg
```
`restore.sh` **деструктивен** (`pg_restore --clean`): расшифровывает архив,
восстанавливает БД, распаковывает загрузки (если каталог доступен на запись — иначе
кладёт в `/backups/restored-uploads` для ручного копирования). После — перезапустить
API. Регулярно **проверяйте восстановление** на эфемерной БД.

> **Приватность данных (важно):** контент (сообщения, заметки и т.д.) хранится в
> Postgres **в открытом виде** — нет field-level и нет end-to-end шифрования.
> Данные видны оператору инстанса, БД и аккаунту разработчика (god-mode). Защита в
> покое обеспечивается **шифрованием бэкапов** (этот раздел) и, по желанию,
> шифрованием диска/тома (LUKS и т.п.) на уровне хоста. Если нужна приватность от
> самого сервера — требуется E2E (вне текущей архитектуры).

## 5a. Push-уведомления (Web Push / VAPID)

Напоминания, события календаря и открытие капсул доставляются и **вне приложения**
(когда вкладка закрыта) через Web Push. Включается заданием VAPID-ключей; без них
поведение прежнее — доставка только по WebSocket открытым клиентам.

```bash
# 1. Сгенерировать ключи (один раз), положить в секрет-стор:
pip install py-vapid && vapid --gen   # или: npx web-push generate-vapid-keys
#    → VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (base64url)
# 2. Установить отправщик (он опционален, ленивый импорт):
pip install pywebpush       # или раскомментировать строку в requirements.txt
# 3. Задать env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:you@domain
```

Фронт сам подписывает браузер после входа (`/me/push/public-key` → `/me/push/subscribe`),
запрашивая разрешение на уведомления. Push требует HTTPS (`IS_PRODUCTION=true`).
Просроченные подписки (404/410) удаляются автоматически при отправке.

> Личные напоминания без семьи теперь доставляются автору (раньше молча терялись).
> Mobile-push (Expo/FCM) можно добавить тем же бэкендом — таблица `push_subscriptions`
> и сервис `app/services/push.py` каналонезависимы.

## 6. Наблюдаемость
- Подключить error-tracking (Sentry) и структурные логи.
- `/health` — liveness; убедиться, что отражает доступность БД.
- Алерт на события блокировки логина (security-лог `login_throttle`).

## 7. Чеклист перед запуском
- [ ] `IS_PRODUCTION=true`, `JWT_SECRET` из секретов, `CORS_ORIGINS` = https без `*`
- [ ] `alembic upgrade heads` выполнен; `AUTO_MIGRATE=false`
- [ ] TLS + security-заголовки страниц фронта (`infra/nginx.example.conf`)
- [ ] uvicorn с `--proxy-headers` (иначе per-IP лимиты не работают)
- [ ] `BACKUP_ENCRYPTION_KEY` задан (из секрет-стора, хранится отдельно); сервис `backup` запущен; восстановление проверено
- [ ] Error-tracking и алерты включены
- [ ] (Опц.) Web-push: `VAPID_*` заданы, `pywebpush` установлен, проверено уведомление
- [ ] `pytest` зелёный на живой/эфемерной БД
- [ ] Если ≥2 инстансов: `REDIS_URL` и `STORAGE_BACKEND=s3` заданы

## Известные follow-up
- Удаление семьи чистит файлы только для `local`-бэкенда (`families.py` rmtree).
  Для `s3` объекты осиротеют — нужен batch-delete по префиксу `chat_files/<id>/` и
  `<family_id>/` (вынести в `storage` и вызвать в `delete_family`).
- Presence-счётчик в Redis имеет защитный TTL 24ч; при аварийном падении инстанса
  возможен временный дрейф «online» до истечения TTL.
