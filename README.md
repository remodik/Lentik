# Lentik 🏠

Семейный мессенджер — закрытое пространство для общения, фото и видео.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

## Что умеет

- 💬 Чаты в реальном времени через — вложения, голосовые, реакции, ответы, поиск, статусы прочтения
- 📢 Каналы с постами
- 🖼️ Галерея фото и видео + файловое хранилище
- 📅 Календарь событий с напоминаниями
- ⏰ Личные и семейные напоминания
- 📝 Заметки
- 💰 Бюджет и учёт расходов с балансами участников
- 🌳 Семейное древо с произвольным расположением узлов
- 🛡️ Роли, права доступа и индивидуальные оверрайды прав
- 📜 Журнал аудита действий
- 👥 Управление участниками — инвайты, исключение, передача владения
- 🏠 Несколько семей для одного пользователя
- 🔑 Авторизация по логину + PIN, presence-статусы онлайн

## Структура

```
Lentik/
├── services/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js frontend
├── infra/
│   └── docker-compose.yml
└── README.md
```

## Быстрый старт

### Docker (рекомендуется)

```bash
cp infra/.env.example infra/.env
# Отредактируйте infra/.env

cd infra
docker compose build
docker compose up
```

Приложение доступно на [http://localhost:3000](http://localhost:3000)

### Локальная разработка

Запусти базу данных:

```bash
docker run -d \
  -e POSTGRES_DB=lentik \
  -e POSTGRES_USER=lentik \
  -e POSTGRES_PASSWORD=lentik \
  -p 5432:5432 postgres:16-alpine
```

Затем запусти backend и frontend по отдельности — инструкции в [`services/api/README.md`](services/api/README.md) и [`services/web/README.md`](services/web/README.md).

## Переменные окружения

Скопируй `.env.example` в `.env` и заполни:

```bash
cp infra/.env.example infra/.env
```

| Переменная          | Описание               | Пример                  |
|---------------------|------------------------|-------------------------|
| `POSTGRES_PASSWORD` | Пароль PostgreSQL      | `supersecret`           |
| `JWT_SECRET`        | Секрет для JWT токенов | `random-64-char-string` |
| `UPLOAD_DIR`        | Папка для загрузок     | `/uploads`              |

## Лицензия

MIT