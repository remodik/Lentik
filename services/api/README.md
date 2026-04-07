# Lentik API

FastAPI backend для семейного мессенджера Lentik.

## Стек

- **Python 3.12**
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
│   └── security.py      # Хэширование PIN
├── db/
│   ├── base.py          # Base для моделей
│   └── deps.py          # Зависимость get_db
├── models/              # SQLAlchemy модели
│   ├── user.py
│   ├── family.py
│   ├── membership.py
│   ├── invite.py
│   ├── chat.py
│   ├── message.py
│   └── gallery_item.py
├── routers/             # API эндпоинты
│   ├── auth.py
│   ├── me.py
│   ├── families.py
│   ├── families_join.py
│   ├── invites.py
│   ├── chats.py
│   ├── channels.py
│   └── gallery.py
├── schemas/             # Pydantic схемы
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

| Переменная     | Описание                     | Дефолт    |
|----------------|------------------------------|-----------|
| `DATABASE_URL` | URL подключения к PostgreSQL | —         |
| `JWT_SECRET`   | Секрет для подписи токенов   | —         |
| `UPLOAD_DIR`   | Папка для загруженных файлов | `uploads` |

## API эндпоинты

### Auth

| Метод  | Путь                   | Описание                        |
|--------|------------------------|---------------------------------|
| `POST` | `/auth/register`       | Регистрация (логин + имя + PIN) |
| `POST` | `/auth/pin`            | Вход по логину и PIN            |
| `POST` | `/auth/logout`         | Выход (удаляет куку)            |
| `POST` | `/auth/invite`         | Регистрация по инвайту          |
| `GET`  | `/auth/check-username` | Проверка доступности логина     |

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
| `POST`   | `/families`                        | Создать семью              |
| `GET`    | `/families/{id}`                   | Информация о семье         |
| `PATCH`  | `/families/{id}`                   | Переименовать семью        |
| `POST`   | `/families/join`                   | Вступить по токену инвайта |
| `DELETE` | `/families/{id}/members/{user_id}` | Исключить участника        |

### Чаты

| Метод    | Путь                                      | Описание            |
|----------|-------------------------------------------|---------------------|
| `GET`    | `/families/{id}/chats`                    | Список чатов        |
| `POST`   | `/families/{id}/chats`                    | Создать чат         |
| `GET`    | `/families/{id}/chats/{id}/messages`      | Сообщения           |
| `POST`   | `/families/{id}/chats/{id}/messages`      | Отправить сообщение |
| `PATCH`  | `/families/{id}/chats/{id}/messages/{id}` | Редактировать       |
| `DELETE` | `/families/{id}/chats/{id}/messages/{id}` | Удалить             |
| `WS`     | `/families/{id}/chats/{id}/ws`            | WebSocket           |

### Галерея

| Метод    | Путь                               | Описание       |
|----------|------------------------------------|----------------|
| `GET`    | `/families/{id}/gallery`           | Список медиа   |
| `POST`   | `/families/{id}/gallery`           | Загрузить файл |
| `DELETE` | `/families/{id}/gallery/{item_id}` | Удалить        |

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

Авторизация через куку `lentik_token` (JWT). Без валидного токена соединение закрывается с кодом `4001`.

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