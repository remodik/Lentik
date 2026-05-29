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
├── components/           # UI компоненты по разделам
│   ├── ChatView.tsx, ChatSettingsModal.tsx   # Чат с WebSocket
│   ├── ChannelsView.tsx, ChannelPermissionsEditor.tsx  # Каналы
│   ├── GalleryView.tsx, FilesView.tsx, MediaLightbox.tsx  # Медиа и файлы
│   ├── CalendarView.tsx, RemindersView.tsx   # Календарь и напоминания
│   ├── NotesView.tsx                          # Заметки
│   ├── BudgetView.tsx                         # Бюджет и расходы
│   ├── FamilyTreeView.tsx                     # Семейное древо
│   ├── MembersList.tsx, MemberRolesModal.tsx, RolesEditor.tsx  # Участники и роли
│   ├── AuditLogView.tsx                       # Журнал аудита
│   ├── NotificationSystem.tsx, NotificationBell.tsx, NotificationCenter.tsx  # Уведомления
│   ├── AppLayout.tsx, MobileBottomNav.tsx     # Каркас приложения
│   ├── ThemeProvider.tsx, ThemeSelector.tsx   # Темы
│   ├── ProfileMenu.tsx, SettingsModal.tsx, FamilySettingsModal.tsx
│   └── PinInput.tsx, ConfirmDialog.tsx, Select.tsx, ...
└── lib/
    ├── api.ts            # Типизированный API клиент
    ├── api-base.ts       # Базовый fetch-слой
    ├── families.ts       # Хелперы по семьям
    ├── presence.ts       # Presence через WebSocket
    ├── usePermissions.tsx # Хук прав доступа
    ├── useUserMode.tsx   # Режим пользователя
    └── useUserPopover.ts, useCtrlResize.ts
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