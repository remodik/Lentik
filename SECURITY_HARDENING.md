# Чеклист харденинга безопасности Lentik

Аудит проведён 2026-07-02. Здесь — итоги автоматизированного аудита кодовой базы
и конкретные шаги по укреплению безопасности.

## ✅ Выполнено (кодовые правки)

| # | Что | Файл |
|---|-----|------|
| 1 | nginx: `server_tokens off`, TLS-харденинг (TLSv1.2+1.3, современные шифры, OCSP stapling, session cache), HTTP→HTTPS 301 | `infra/nginx.example.conf` |
| 2 | nginx: edge rate limiting (`limit_req_zone`: 30 r/s общий, 5 r/s на `/auth/`) | `infra/nginx.example.conf` |
| 3 | nginx: `client_max_body_size 60m` (API), 1m (фронт); `proxy_hide_header Server/X-Powered-By` | `infra/nginx.example.conf` |
| 4 | nginx: defense-in-depth заголовки на API-блоке (nosniff, frame-options, referrer, HSTS, permissions-policy) | `infra/nginx.example.conf` |
| 5 | Next.js: `poweredByHeader: false`, `reactStrictMode: true` | `services/web/next.config.mjs` |
| 6 | Docker Compose: порты привязаны к `127.0.0.1` (DB, API, web не торчат наружу) | `infra/docker-compose.yml` |
| 7 | Docker Compose: network tiering (`appnet` + `datanet`; web не видит DB) | `infra/docker-compose.yml` |
| 8 | Docker Compose: `--proxy-headers --forwarded-allow-ips=...` в uvicorn (IP-лимитеры работают за прокси) | `infra/docker-compose.yml` |
| 9 | Docker Compose: healthchecks для API и web; resource limits для всех сервисов | `infra/docker-compose.yml` |
| 10 | Backup Dockerfile: non-root пользователь `backup` | `infra/backup/Dockerfile` |
| 11 | Web Dockerfile: `USER node` (non-root в проде); override в dev на Windows/Linux | `services/web/Dockerfile` |
| 12 | `.env.example` с placeholder'ами и командами генерации (API + infra) | `services/api/.env.example`, `infra/.env.example` |
| 13 | `.gitignore`: fixed pattern ordering — `!.env.example` теперь работает для обоих блоков | `.gitignore` |

---

## 🔴 Операционные — сделать вручную (вне кода)

### 1. Ротация секретов
Текущие секреты в `infra/.env` и `services/api/.env` — **реальные** (не плейсхолдеры):
- `JWT_SECRET` — 64-символьный hex (может быть скомпрометирован, если .env когда-либо утекал)
- `BACKUP_ENCRYPTION_KEY` — 64-символьный base64 (то же)
- `POSTGRES_PASSWORD=lentik` — **слабый, равен username** (CWE-798)

**Действие** — сгенерировать и подставить новые:
```bash
# В локальной dev: просто перегенерируйте. Все сессии инвалидируются.
openssl rand -hex 32          # JWT_SECRET
openssl rand -base64 48       # BACKUP_ENCRYPTION_KEY
openssl rand -hex 24          # POSTGRES_PASSWORD

# После смены POSTGRES_PASSWORD — пересоздать volume или подключиться
# от нового пользователя:
docker compose exec db psql -U lentik -c "ALTER USER lentik PASSWORD 'new_password';"
```

### 2. Настройка прод-reverse-proxy
`infra/nginx.example.conf` обновлён — примените его к реальному прод-серверу:
- Скопируйте в `/etc/nginx/conf.d/lentik.conf`
- Подставьте свои домены и пути к сертификатам Let's Encrypt
- Запустите `nginx -t && systemctl reload nginx`
- Убедитесь, что **HTTP→HTTPS редирект** и **TLS-шифры** работают:
  ```bash
  curl -sI https://lentik.example.com | grep -i "strict-transport\|content-type\|x-frame\|server"
  # Ожидание: HSTS, nosniff, DENY, Server не должен содержать версию nginx
  ```

### 3. Убрать публикацию порта БД в проде
В прод-`docker-compose.yml` **уберите `ports:` для `db` целиком** — к БД должен
доступаться только api через внутреннюю сеть `datanet`, не снаружи.

---

## 🟡 Рекомендации на будущее (отдельные задачи)

| Приоритет | Что | Контекст |
|----------|-----|----------|
| HIGH | Заменить `python-jose==3.5.0` → `PyJWT` | python-jose не поддерживается, известные CVE-2024-33664/33663. Миграция: `pip install pyjwt[cryptography]`, заменить `decode()`/`encode()` |
| HIGH | Сократить JWT TTL: 30 дней → часы/день + refresh-токены | Украденный cookie = 30 дней доступа. Минимум — сократить до 1-7 дней |
| HIGH | PIN-хэширование: PBKDF2-SHA256 → argon2/bcrypt | 4–8 цифр = крошечный keyspace; PBKDF2 не резистентен к GPU. `argon2-cffi` или bcrypt через passlib |
| MEDIUM | Общий rate-limit на не-auth роутах | Инфраструктура `SlidingWindowLimiter` есть, но подключена только к `/auth/*`. Сообщения/галерея/расходы — без лимитов |
| MEDIUM | Глобальный exception handler | Нет `@app.exception_handler` — полагается на Starlette defaults. Добавить explicit handler с санитизированным 500 + server-side logging |
| MEDIUM | Rate-limit на `/auth/invite` (join-by-invite) | Утеченный invite-токен можно брутфорсить без throttle |
| MEDIUM | Least-privilege DB роль | Сейчас `lentik` — суперпользователь. Создать `lentik_app` с SELECT/INSERT/UPDATE/DELETE на нужных таблицах |
| LOW | Добавить `bandit`/`pip-audit` в CI | Автоматический скан зависимостей и кода на известные паттерны |
| LOW | Stream file-upload size checks | Сейчас файл целиком буферизуется в память перед проверкой размера (DoS-вектор) |
| LOW | `allow_methods/headers` → конкретный список в CORS | Сейчас `["*"]`; ограничить до реально используемых методов/заголовков |

---

## Сводка текущего состояния

| Слой | До | После |
|------|----|-------|
| nginx (edge) | Нет TLS-харднинга, нет redirect, нет rate-limit, API-блок без заголовков | TLSv1.2+1.3, шифры, OCSP, HTTP→HTTPS, limit_req, defense-in-depth |
| Next.js | `X-Powered-By: Next.js`, no strictMode | `poweredByHeader: false`, `reactStrictMode: true` |
| Docker | Порты на 0.0.0.0, один bridge, root web/backup, no healthchecks | localhost-only, tiered networks, non-root, healthchecks, limits |
| App middleware | Хороший baseline (nosniff, frame-options, HSTS в проде) | Не изменён — уже адекватный |
| Файлы конфигурации | Нет `.env.example`, `.gitignore` ломал exception | Два `.env.example`, gitignore исправлен |
