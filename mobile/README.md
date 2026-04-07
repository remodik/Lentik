# Lentik Mobile — Android-приложение

React Native (Expo) прототип семейного мессенджера **Lentik** для Android 13+.

## Дизайн

- Тёплые цвета: бежевый фон `#FFF8F0`, акцент — терракот `#C8693A`
- Шрифт: минимум 18px во всех элементах
- Touch-targets: кнопки не менее 56dp
- Иконки везде с подписями
- Целевая аудитория: пожилые пользователи

---

## Структура

```
src/
├── api/            # HTTP-клиент + методы API
│   ├── client.js   # axios с Bearer-токеном
│   ├── auth.js     # Вход, регистрация
│   ├── chats.js    # Чаты, сообщения
│   ├── families.js # Семьи
│   ├── gallery.js  # Галерея
│   └── me.js       # Текущий пользователь
├── context/
│   ├── AuthContext.js   # Авторизация + хранение токена
│   └── FamilyContext.js # Выбранная семья
├── navigation/
│   └── RootNavigator.js # Роутинг: Auth / FamilySelect / Tabs
├── screens/
│   ├── LoginScreen.js
│   ├── RegisterScreen.js
│   ├── FamilySelectScreen.js
│   ├── ChatsListScreen.js
│   ├── ChatScreen.js       # WebSocket + отправка сообщений
│   ├── GalleryScreen.js    # Фото-сетка + загрузка
│   └── ProfileScreen.js
└── components/
    ├── PinKeypad.js    # Цифровая клавиатура для PIN
    ├── MessageBubble.js
    └── ChatListItem.js
```

---

## Предварительные требования

| Инструмент | Версия |
|-----------|--------|
| Node.js   | 18+    |
| npm / yarn | любая |
| Expo CLI  | последняя |
| EAS CLI   | для сборки APK |
| Android Studio | для эмулятора |

```bash
# Установить глобально
npm install -g expo-cli eas-cli
```

---

## Шаг 1 — Настройка URL сервера

Откройте файл **`src/config.js`** и укажите URL вашего FastAPI backend:

```js
// Пример для локальной сети:
export const API_BASE_URL = 'http://192.168.1.100:8000';

// Пример для публичного сервера:
export const API_BASE_URL = 'https://api.your-domain.com';
```

> **Важно:** Если сервер работает локально на ПК, телефон должен быть в одной Wi-Fi сети.
> Используйте IP-адрес ПК, а не `localhost`.

---

## Шаг 2 — Установка зависимостей

```bash
cd lentik-mobile
npm install
```

---

## Шаг 3 — Добавить иконки приложения (опционально)

Положите в папку `assets/`:
- `icon.png` — 1024×1024 (иконка приложения)
- `splash.png` — 1284×2778 (заставка при запуске)
- `adaptive-icon.png` — 1024×1024 (Android adaptive icon)

Если иконок нет — приложение запустится с пустой иконкой.

---

## Шаг 4 — Запуск на реальном устройстве или эмуляторе

### Способ А: Expo Go (быстрый старт)

1. Установите [Expo Go](https://expo.dev/go) на Android-устройство
2. Запустите dev-сервер:
   ```bash
   npm start
   ```
3. Сканируйте QR-код в Expo Go

> **Ограничение:** Expo Go не поддерживает всё — используйте способ Б для полноценного теста.

### Способ Б: Development Build (рекомендуется)

```bash
# Создать development build для Android
npx expo run:android
```

Требует Android Studio с настроенным эмулятором или подключённым устройством.

---

## Шаг 5 — Сборка APK для установки

### Облачная сборка через EAS (рекомендуется)

1. Войдите в аккаунт Expo:
   ```bash
   eas login
   ```

2. Настройте проект:
   ```bash
   eas build:configure
   ```
   Это создаст файл `eas.json`.

3. Запустите сборку:
   ```bash
   # Preview APK (для тестирования)
   eas build --platform android --profile preview
   
   # Release AAB (для Google Play)
   eas build --platform android --profile production
   ```

4. После сборки скачайте APK по ссылке из консоли.

### Локальная сборка (требует Android SDK)

```bash
# Сгенерировать android/ папку
npx expo prebuild --platform android

# Собрать debug APK
cd android && ./gradlew assembleDebug

# APK будет здесь:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Установка APK на телефон

1. Включите «Установку из неизвестных источников» в настройках Android
2. Скопируйте APK на телефон (USB, облако, email)
3. Откройте файловый менеджер и нажмите на APK
4. Подтвердите установку

---

## Пример конфигурации eas.json

Если EAS спросит — вот готовый пример:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## Требования к серверу

Приложение подключается к **Lentik FastAPI backend** по REST API и WebSocket:

| Метод | Путь | Назначение |
|-------|------|-----------|
| POST | `/auth/pin` | Вход |
| POST | `/auth/register` | Регистрация |
| GET  | `/me` | Данные пользователя |
| GET  | `/me/families` | Список семей |
| GET  | `/families/:id` | Детали семьи |
| GET  | `/families/:id/chats` | Список чатов |
| GET  | `.../chats/:id/messages` | Сообщения |
| POST | `.../chats/:id/messages` | Отправить сообщение |
| WS   | `.../chats/:id/ws?token=` | Real-time чат |
| GET  | `/families/:id/gallery` | Галерея |
| POST | `/families/:id/gallery` | Загрузить фото |

---

## Технологии

- **Expo SDK 51** — мобильная платформа
- **React Native 0.74** — UI фреймворк
- **React Navigation v6** — навигация
- **Axios** — HTTP запросы
- **expo-secure-store** — безопасное хранение токена
- **expo-image-picker** — выбор фото из галереи

---

## Разработка

```bash
# Запуск с очисткой кеша
npx expo start --clear

# Запуск только на Android
npx expo start --android

# Логи
npx expo start --verbose
```

---

## Поддерживаемые версии Android

- Минимум: **Android 13** (SDK 33)
- Цель: **Android 14** (SDK 34)
