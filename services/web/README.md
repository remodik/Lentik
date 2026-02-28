# Lentik Web

Next.js frontend для семейного мессенджера Lentik.

## Стек

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **WebSocket** — чаты в реальном времени

## Структура

```
src/
├── app/                  # Страницы (App Router)
│   ├── page.tsx          # Лендинг
│   ├── register/         # Регистрация
│   ├── login/            # Вход
│   ├── onboarding/       # Создание / вступление в семью
│   └── app/              # Основное приложение
├── components/
│   ├── ChatView.tsx       # Чат с WebSocket
│   ├── GalleryView.tsx    # Галерея
│   ├── MembersList.tsx    # Список участников
│   ├── ProfileMenu.tsx    # Попап профиля
│   ├── SettingsModal.tsx  # Модал настроек
│   └── PinInput.tsx       # Компонент ввода PIN
└── lib/
    └── api.ts             # Типизированный API клиент
```

## Установка и запуск

```bash
cd services/web

npm install

# Настроить переменные окружения
cp .env.example .env.local
# Отредактируй .env.local

npm run dev
```

Приложение доступно на [http://localhost:3000](http://localhost:3000)

## Переменные окружения

| Переменная | Описание        | Дефолт                  |
|------------|-----------------|-------------------------|
| `API_URL`  | URL backend API | `http://localhost:8000` |

> **Важно:** `API_URL` используется в `next.config.mjs` для настройки proxy rewrites. При сборке Docker-образа передавай как `ARG`, а не только как `ENV`.

## Сборка для продакшена

```bash
npm run build
npm start
```

## API клиент

Все запросы к backend идут через `/api/*` и `/static/*` — Next.js проксирует их на backend через `next.config.mjs`. Это позволяет избежать CORS и работать с httpOnly куками.

Клиент находится в `src/lib/api.ts` и экспортирует типизированные функции:

```ts
import { getMe, getChats, sendMessage } from "@/lib/api";
```

## Маршруты

| Путь          | Описание                        |
|---------------|---------------------------------|
| `/`           | Лендинг                         |
| `/register`   | Регистрация                     |
| `/login`      | Вход                            |
| `/onboarding` | Создание или вступление в семью |
| `/app`        | Основное приложение             |

## Авторизация

Используется httpOnly кука `lentik_token` с JWT. Все запросы отправляются с `credentials: "include"`. При 401 — редирект на `/login`.

WebSocket подключается напрямую к backend на порт `8000`, токен передаётся через куку автоматически.