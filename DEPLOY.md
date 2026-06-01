# Lentik — деплой и эксплуатация

Runbook для прод-развёртывания. Связан с заметками `Lentik Prod-Readiness/` (P1–P6).

## 1. Конфигурация (env)

| Переменная | Прод | Назначение |
|---|---|---|
| `IS_PRODUCTION` | `true` | Secure-cookie; небезопасный CORS валит старт |
| `JWT_SECRET` | ≥32 симв. из секрет-стора | подпись JWT |
| `DATABASE_URL` | управляемый Postgres | БД |
| `CORS_ORIGINS` | только `https://`-origin фронта, без `*`/localhost | CORS |
| `AUTO_MIGRATE` | `false` | миграции — отдельным шагом (см. §2) |
| `SCHEDULER_ENABLED` | `true` на одном наборе инстансов | планировщик напоминаний |
| `REDIS_URL` | задать при ≥2 инстансах | общий WS fan-out (P1) + rate-limit (P3) |
| `STORAGE_BACKEND` | `s3` при ≥2 инстансах | хранилище загрузок (P4) |
| `S3_BUCKET` / `S3_ENDPOINT_URL` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | при `s3` | параметры бакета |

> При `IS_PRODUCTION=true` приложение **падает на старте**, если `CORS_ORIGINS`
> содержит `http://`/localhost (см. `main.py::_check_security_config`).

## 2. Миграции (P2)
Не полагайтесь на авто-миграцию в проде (`AUTO_MIGRATE=false`). Применяйте **один раз**
перед запуском реплик, отдельным шагом деплоя / init-контейнером:

```bash
cd services/api && alembic upgrade heads
```

Приложение на старте лишь **проверяет** дрейф (при `STRICT_MIGRATIONS=true` — падает,
если БД не на head).

## 3. Запуск за reverse-proxy
- Пример заголовков и проксирования: [`infra/nginx.example.conf`](infra/nginx.example.conf)
  (TLS, CSP/`X-Frame-Options` для страниц фронта — P5, WebSocket upgrade).
- **Важно (per-IP лимиты):** за прокси `request.client.host` = IP прокси, поэтому
  per-IP rate-limit/throttle станут глобальными. Запускайте uvicorn с доверием к
  forwarded-заголовкам:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port 8000 \
      --proxy-headers --forwarded-allow-ips="<ip_прокси>"
  ```

## 4. Масштабирование (>1 инстанса)
Обязательно перед горизонтальным масштабированием:
- **`REDIS_URL`** — иначе WS-сообщения не пересекают границу инстанса (P1), а
  rate-лимитеры считаются раздельно (P3).
- **`STORAGE_BACKEND=s3`** — иначе загрузки видны только инстансу, куда залились (P4).
- **Планировщик** идемпотентен (`SELECT … FOR UPDATE SKIP LOCKED`), несколько
  включённых инстансов безопасны; можно вынести в отдельный worker и выключить
  `SCHEDULER_ENABLED` на web-инстансах.

## 5. Бэкапы
- Postgres: регулярный `pg_dump`/снапшоты + **проверка восстановления**.
- Загрузки: бэкап/версионирование S3-бакета (или тома при local).

## 6. Наблюдаемость
- Подключить error-tracking (Sentry) и структурные логи.
- `/health` — liveness; убедиться, что отражает доступность БД.
- Алерт на события блокировки логина (security-лог `login_throttle`).

## 7. Чеклист перед запуском
- [ ] `IS_PRODUCTION=true`, `JWT_SECRET` из секретов, `CORS_ORIGINS` = https без `*`
- [ ] `alembic upgrade heads` выполнен; `AUTO_MIGRATE=false`
- [ ] TLS + security-заголовки страниц фронта (`infra/nginx.example.conf`)
- [ ] uvicorn с `--proxy-headers` (иначе per-IP лимиты не работают)
- [ ] Бэкап Postgres + проверка восстановления
- [ ] Error-tracking и алерты включены
- [ ] `pytest` зелёный на живой/эфемерной БД
- [ ] Если ≥2 инстансов: `REDIS_URL` и `STORAGE_BACKEND=s3` заданы

## Известные follow-up
- Удаление семьи чистит файлы только для `local`-бэкенда (`families.py` rmtree).
  Для `s3` объекты осиротеют — нужен batch-delete по префиксу `chat_files/<id>/` и
  `<family_id>/` (вынести в `storage` и вызвать в `delete_family`).
- Presence-счётчик в Redis имеет защитный TTL 24ч; при аварийном падении инстанса
  возможен временный дрейф «online» до истечения TTL.
