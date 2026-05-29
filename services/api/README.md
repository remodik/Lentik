# Lentik API

FastAPI backend для семейного мессенджера Lentik.

## Стек

- **Python 3.13**
- **FastAPI** — веб-фреймворк
- **SQLAlchemy** (async) + **asyncpg** — работа с БД
- **Alembic** — миграции
- **PostgreSQL 16** — база данных
- **python-jose** — JWT авторизация
- **passlib** — хэширование PIN
- **WebSocket** — чаты в реальном времени

## Структура

```
app/
├── auth/
│   └── deps.py          # Зависимость get_current_user
├── core/
│   ├── jwt.py           # Создание и декодирование JWT
│   ├── security.py      # Хэширование PIN
│   ├── rate_limit.py    # Rate limiting
│   ├── uploads.py       # Хранилище загруженных файлов
│   └── ws_tickets.py    # Одноразовые тикеты для WebSocket
├── db/
│   ├── base.py          # Base для моделей
│   └── deps.py          # Зависимость get_db
├── models/              # SQLAlchemy модели
│   ├── user.py, session.py
│   ├── family.py, membership.py, invite.py
│   ├── role.py, permission_override.py, audit_log.py
│   ├── chat.py, message.py, message_read.py, reaction.py
│   ├── channel.py, post.py
│   ├── gallery_item.py
│   ├── calendar_event.py, reminder.py
│   ├── note.py
│   ├── budget_transaction.py, expense.py
│   └── family_tree.py
├── routers/             # API эндпоинты
│   ├── auth.py, me.py, invites.py
│   ├── families.py, families_join.py
│   ├── family_roles.py, permission_overrides.py, audit_log.py
│   ├── chats.py, channels.py
│   ├── gallery.py, uploads.py
│   ├── calendar.py, reminders.py, notes.py
│   ├── budget.py, expenses.py
│   ├── family_tree.py
│   └── health.py
├── schemas/             # Pydantic схемы
├── services/            # Бизнес-логика, планировщики напоминаний
└── ws/
    └── manager.py       # WebSocket менеджер
```

## Установка и запуск

```bash
cd services/api

# Создать виртуальное окружение
uv venv
uv pip install -r requirements.txt

# Настроить переменные окружения
cp .env.example .env
# Отредактируй .env

# Применить миграции
uv run alembic upgrade head

# Запустить сервер
uv run uvicorn app.main:app --reload
```

API доступно на [http://localhost:8000](http://localhost:8000)  
Документация: [http://localhost:8000/docs](http://localhost:8000/docs)

## Переменные окружения

Скопируй `.env.example` в `.env`:

```bash
cp .env.example .env
```

| Переменная          | Описание                                    | Дефолт      |
|---------------------|---------------------------------------------|-------------|
| `DATABASE_URL`      | URL подключения к PostgreSQL                | —           |
| `JWT_SECRET`        | Секрет для подписи токенов (мин. 32 символа)| —           |
| `UPLOAD_DIR`        | Папка для загруженных файлов                | `uploads`   |
| `IS_PRODUCTION`     | Режим продакшена                            | `false`     |
| `STRICT_MIGRATIONS` | Падать при дрейфе миграций БД               | `false`     |
| `CORS_ORIGINS`      | Список разрешённых origin'ов                | localhost   |

## API эндпоинты

### Auth

| Метод  | Путь                   | Описание                        |
|--------|------------------------|---------------------------------|
| `POST` | `/auth/register`       | Регистрация (логин + имя + PIN) |
| `POST` | `/auth/pin`            | Вход по логину и PIN            |
| `POST` | `/auth/logout`         | Выход (удаляет куку)            |
| `POST` | `/auth/invite`         | Регистрация по инвайту          |
| `GET`  | `/auth/check-username` | Проверка доступности логина     |
| `POST` | `/auth/ws-ticket`      | Одноразовый тикет для WebSocket |

### Профиль

| Метод    | Путь                | Описание                  |
|----------|---------------------|---------------------------|
| `GET`    | `/me`               | Текущий пользователь      |
| `PATCH`  | `/me`               | Обновить профиль          |
| `PATCH`  | `/me/pin`           | Сменить PIN               |
| `POST`   | `/me/avatar`        | Загрузить аватар          |
| `GET`    | `/me/families`      | Список семей пользователя |
| `DELETE` | `/me/families/{id}` | Покинуть семью            |

### Семьи

| Метод    | Путь                               | Описание                   |
|----------|------------------------------------|----------------------------|
| `POST`   | `/families`                             | Создать семью              |
| `GET`    | `/families/{id}`                        | Информация о семье         |
| `PATCH`  | `/families/{id}`                        | Переименовать семью        |
| `POST`   | `/families/join`                        | Вступить по токену инвайта |
| `DELETE` | `/families/{id}/members/{member_id}`    | Исключить участника        |
| `PATCH`  | `/families/{id}/members/{member_id}/role` | Сменить роль участника   |
| `POST`   | `/families/{id}/transfer-ownership`     | Передать владение          |
| `WS`     | `/families/{id}/ws`                      | WebSocket presence         |

### Роли и права

| Метод    | Путь                                  | Описание                   |
|----------|---------------------------------------|----------------------------|
| `GET`    | `/families/{id}/me/permissions`       | Мои права в семье          |
| `GET`    | `/families/{id}/permissions/catalog`  | Каталог доступных прав     |
| `GET`    | `/families/{id}/members/roles`        | Роли участников            |
| `GET`    | `/families/{id}/roles`                | Список ролей               |
| `POST`   | `/families/{id}/roles`                | Создать роль               |
| `PATCH`  | `/families/{id}/roles/{role_id}`      | Изменить роль              |
| `DELETE` | `/families/{id}/roles/{role_id}`      | Удалить роль               |
| `GET`    | `/families/{id}/audit-log`            | Журнал аудита              |

### Чаты

| Метод    | Путь                                      | Описание            |
|----------|-------------------------------------------|---------------------|
| `GET`    | `/families/{id}/chats`                         | Список чатов          |
| `POST`   | `/families/{id}/chats`                         | Создать чат           |
| `PATCH`  | `/families/{id}/chats/{cid}`                   | Изменить чат          |
| `DELETE` | `/families/{id}/chats/{cid}`                   | Удалить чат           |
| `POST`   | `/families/{id}/chats/{cid}/pin`               | Закрепить чат         |
| `DELETE` | `/families/{id}/chats/{cid}/pin`               | Открепить чат         |
| `GET`    | `/families/{id}/chats/{cid}/messages`          | Сообщения             |
| `GET`    | `/families/{id}/chats/{cid}/messages/search`   | Поиск по сообщениям   |
| `POST`   | `/families/{id}/chats/{cid}/messages`          | Отправить сообщение   |
| `POST`   | `/families/{id}/chats/{cid}/messages/attachments` | Сообщение с файлами |
| `POST`   | `/families/{id}/chats/{cid}/messages/voice`    | Голосовое сообщение   |
| `POST`   | `/families/{id}/chats/{cid}/messages/read`     | Отметить прочтённым   |
| `PATCH`  | `/families/{id}/chats/{cid}/messages/{mid}`    | Редактировать         |
| `DELETE` | `/families/{id}/chats/{cid}/messages/{mid}`    | Удалить               |
| `POST`   | `/families/{id}/chats/{cid}/messages/{mid}/reactions` | Добавить реакцию |
| `DELETE` | `/families/{id}/chats/{cid}/messages/{mid}/reactions` | Снять реакцию    |
| `WS`     | `/families/{id}/chats/{cid}/ws`                | WebSocket             |

### Каналы

| Метод    | Путь                                          | Описание         |
|----------|-----------------------------------------------|------------------|
| `GET`    | `/families/{id}/channels`                     | Список каналов   |
| `POST`   | `/families/{id}/channels`                     | Создать канал    |
| `PATCH`  | `/families/{id}/channels/{cid}`               | Изменить канал   |
| `GET`    | `/families/{id}/channels/{cid}/posts`         | Посты канала     |
| `POST`   | `/families/{id}/channels/{cid}/posts`         | Создать пост     |

### Календарь и напоминания

| Метод    | Путь                                  | Описание              |
|----------|---------------------------------------|-----------------------|
| `GET`    | `/families/{id}/calendar`             | События               |
| `POST`   | `/families/{id}/calendar`             | Создать событие       |
| `PATCH`  | `/families/{id}/calendar/{event_id}`  | Изменить событие      |
| `DELETE` | `/families/{id}/calendar/{event_id}`  | Удалить событие       |
| `GET`    | `/families/{id}/reminders`            | Напоминания           |
| `POST`   | `/families/{id}/reminders`            | Создать напоминание   |
| `GET`    | `/reminders/{id}`                     | Напоминание           |
| `PATCH`  | `/reminders/{id}`                     | Изменить              |
| `DELETE` | `/reminders/{id}`                     | Удалить               |

### Заметки

| Метод    | Путь                          | Описание         |
|----------|-------------------------------|------------------|
| `GET`    | `/families/{id}/notes`        | Список заметок   |
| `POST`   | `/families/{id}/notes`        | Создать заметку  |
| `PATCH`  | `/notes/{note_id}`            | Изменить         |
| `DELETE` | `/notes/{note_id}`            | Удалить          |

### Бюджет и расходы

| Метод    | Путь                                  | Описание                |
|----------|---------------------------------------|-------------------------|
| `GET`    | `/families/{id}/budget/categories`    | Категории               |
| `GET`    | `/families/{id}/budget/transactions`  | Транзакции              |
| `POST`   | `/families/{id}/budget/transactions`  | Добавить транзакцию     |
| `GET`    | `/families/{id}/budget/summary`       | Сводка                  |
| `GET`    | `/families/{id}/budget/balances`      | Балансы участников      |
| `GET`    | `/budget/transactions/{tx_id}`        | Транзакция              |
| `PATCH`  | `/budget/transactions/{tx_id}`        | Изменить                |
| `DELETE` | `/budget/transactions/{tx_id}`        | Удалить                 |
| `GET`    | `/families/{id}/expenses`             | Расходы                 |
| `POST`   | `/families/{id}/expenses`             | Добавить расход         |
| `GET`    | `/families/{id}/expenses/balance`     | Балансы по расходам     |

### Семейное древо

| Метод    | Путь                              | Описание           |
|----------|-----------------------------------|--------------------|
| `GET`    | `/families/{id}/tree`             | Древо              |
| `POST`   | `/families/{id}/tree`             | Добавить персону   |
| `PATCH`  | `/tree/persons/{person_id}`       | Изменить персону   |
| `DELETE` | `/tree/persons/{person_id}`       | Удалить персону    |
| `DELETE` | `/tree/relations/{relation_id}`   | Удалить связь      |

### Галерея

| Метод    | Путь                               | Описание       |
|----------|------------------------------------|----------------|
| `GET`    | `/families/{id}/gallery`             | Список медиа       |
| `POST`   | `/families/{id}/gallery`             | Загрузить файл     |
| `DELETE` | `/families/{id}/gallery/{item_id}`   | Удалить            |
| `POST`   | `/families/{id}/gallery/bulk-delete` | Удалить несколько  |

### Файлы (статика)

| Метод | Путь                                       | Описание           |
|-------|--------------------------------------------|--------------------|
| `GET` | `/static/uploads/avatars/{filename}`       | Аватары            |
| `GET` | `/static/uploads/chat_files/{chat_id}/{filename}` | Файлы чатов |
| `GET` | `/static/uploads/{family_id}/{filename}`   | Медиа семьи        |

## Миграции

```bash
# Применить все
uv run alembic upgrade head

# Откатить последнюю
uv run alembic downgrade -1

# Создать новую миграцию
uv run alembic revision -m "description"
```

## WebSocket

Подключение: `ws://host/families/{family_id}/chats/{chat_id}/ws`

Авторизация — через куку `lentik_token` (JWT) либо одноразовый тикет, полученный из `POST /auth/ws-ticket` и переданный query-параметром. Тикеты одноразовые и живут 60 секунд (см. `core/ws_tickets.py`), что держит долгоживущий JWT вне URL (логи, история, Referer). Без валидного токена соединение закрывается с кодом `4001`.

Помимо чатов, presence-статусы участников транслируются через `ws://host/families/{family_id}/ws`.

Типы сообщений от сервера:

```json
{ "type": "new_message", "message": { ... } }
{ "type": "message_edited", "message": { ... } }
{ "type": "message_deleted", "message_id": "uuid" }
```

Ping/pong для поддержания соединения:

```
Client → "ping"
Server → "pong"
```