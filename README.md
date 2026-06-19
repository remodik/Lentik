<div align="center">

# 🏠 Lentik

**Приватный семейный мессенджер** — закрытое пространство для общения, фото, видео и совместной жизни.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![React Native](https://img.shields.io/badge/React_Native-Expo_51-61DAFB?logo=react)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📑 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Стек](#-стек)
- [Структура](#-структура)
- [Быстрый старт](#-быстрый-старт)
- [Переменные окружения](#-переменные-окружения)
- [Деплой](#-деплой)
- [Лицензия](#-лицензия)

## 🌟 О проекте

Lentik — это self-hosted платформа для одной или нескольких семей: безопасное место,
где можно переписываться в реальном времени, делиться фото и видео, вести общий
календарь, бюджет и даже строить семейное древо. Всё под вашим контролем — данные
живут на вашем сервере.

Веб-приложение (Next.js) и мобильное приложение (React Native / Expo) работают с одним
backend на FastAPI.

## ✨ Возможности

- 💬 **Чаты в реальном времени** — вложения, голосовые, реакции, ответы, поиск, статусы прочтения
- 📢 **Каналы** с постами
- 🖼️ **Галерея** фото и видео + файловое хранилище
- 📅 **Календарь** событий с напоминаниями
- ⏰ **Напоминания** — личные и семейные
- 📝 **Заметки**
- 💰 **Бюджет** и учёт расходов с балансами участников
- 🌳 **Семейное древо** с произвольным расположением узлов
- 🛡️ **Роли и права доступа** с индивидуальными оверрайдами
- 📜 **Журнал аудита** действий
- 👥 **Управление участниками** — инвайты, исключение, передача владения
- 🏠 **Несколько семей** для одного пользователя
- 🔑 **Авторизация** по логину + PIN, presence-статусы онлайн
- 📱 **Мобильное приложение** на React Native (Expo)

## 🧰 Стек

| Слой        | Технологии                                                |
|-------------|-----------------------------------------------------------|
| Frontend    | Next.js 15, TypeScript, React                             |
| Mobile      | React Native 0.74, Expo 51, React Navigation              |
| Backend     | FastAPI, Python, WebSocket                                |
| База данных | PostgreSQL 16                                             |
| Realtime    | WebSocket + Redis pub/sub (fan-out, кросс-инстанс)        |
| Инфра       | Docker Compose, reverse-proxy                             |

<!--
<div align="center">
  <img src="docs/screenshots/chat.png" width="45%" />
  <img src="docs/screenshots/gallery.png" width="45%" />
</div>
-->

## 📁 Структура

```
Lentik/
├── services/
│   ├── api/          # FastAPI backend
│   └── web/          # Next.js frontend
├── mobile/           # React Native (Expo) приложение
├── infra/
│   └── docker-compose.yml
├── DEPLOY.md         # Руководство по развёртыванию
└── README.md
```

## 🚀 Быстрый старт

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

Запустите базу данных:

```bash
docker run -d \
  -e POSTGRES_DB=lentik \
  -e POSTGRES_USER=lentik \
  -e POSTGRES_PASSWORD=lentik \
  -p 5432:5432 postgres:16-alpine
```

Затем запустите backend и frontend по отдельности — инструкции в
[`services/api/README.md`](services/api/README.md) и
[`services/web/README.md`](services/web/README.md).

### Мобильное приложение

```bash
cd mobile
npm install
npm start          # запуск Expo dev-сервера
npm run android    # или npm run ios
```

Подробнее — в [`mobile/README.md`](mobile/README.md).

## ⚙️ Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp infra/.env.example infra/.env
```

| Переменная           | Описание                                          | Пример                  |
|----------------------|---------------------------------------------------|-------------------------|
| `POSTGRES_PASSWORD`     | Пароль PostgreSQL                                 | `supersecret`           |
| `JWT_SECRET`            | Секрет для JWT токенов                             | `random-64-char-string` |
| `UPLOAD_DIR`            | Папка для загрузок                                | `/uploads`              |
| `DEVELOPER_USERNAME`    | Логин аккаунта разработчика (god-mode + `/admin`) | `admin`                 |
| `BACKUP_ENCRYPTION_KEY` | Ключ AES-256 для шифрования бэкапов               | `openssl rand -base64 48` |

> 🔐 **Бэкапы.** Сервис `backup` в Compose делает зашифрованные (AES-256) снимки БД и
> загрузок по расписанию (`BACKUP_INTERVAL_HOURS`, ротация `BACKUP_RETENTION_*`,
> опц. offsite `BACKUP_S3_*`). Без `BACKUP_ENCRYPTION_KEY` сервис не стартует.
> Восстановление и нюансы приватности — в [`DEPLOY.md`](DEPLOY.md#5-бэкапы-шифрованные).

## 📦 Деплой

Полное руководство по развёртыванию в продакшене (reverse-proxy, security headers,
WebSocket upgrade, масштабирование через Redis) — в [`DEPLOY.md`](DEPLOY.md).
