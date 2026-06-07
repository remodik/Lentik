# Lentik — дизайн-система

Краткий гайд по токенам и компонентам фронтенда. Главное правило: **цвета, отступы,
радиусы, тени и анимации берутся из токенов** — никаких «прибитых» значений в JSX/CSS.

## Токены

Источник правды — [`src/styles/tokens.css`](src/styles/tokens.css) (`:root`), темы
переопределяют значения в [`src/styles/themes/`](src/styles/themes/)
(`warm` по умолчанию + `dark`, `sakura`, `retro`, `cyberpunk`).

| Категория     | Где                                                                                                                               | Примеры                                                                                    |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Палитра       | `--cream/warm/ink-*` (RGB-тройки)                                                                                                 | `rgb(var(--ink-900) / 0.5)`, Tailwind `text-ink-700`                                       |
| Поверхности   | `--bg-page/surface/surface-strong/surface-subtle/elevated`                                                                        | фон карточек, модалок                                                                      |
| Границы       | `--border-glass / -strong / -dim`                                                                                                 | рамки стекла                                                                               |
| Акцент        | `--accent / -hover / -soft / -medium / -border`                                                                                   | бренд `#c4956a`                                                                            |
| Текст         | `--text-primary/secondary/tertiary/muted/on-dark`                                                                                 | —                                                                                          |
| **Статусы**   | `--danger / success / warning / info / special-*`                                                                                 | **только эти для красного/зелёного/фиолетового и т.д.**                                    |
| Тиры статусов | `*-fg` (яркий, на тёмном), `*-fg-bold` (тёмный, контраст на светлом), `*-fg-strong`, `*-solid` (заливка), `*-bg-soft`, `*-border` | напр. зелёный текст на светлом — `--success-fg-bold`, активная заливка — `--success-solid` |
| Радиусы       | `--radius-sm…3xl`                                                                                                                 | —                                                                                          |
| Тени          | `--shadow-xs…deep`, `--shadow-glass*`                                                                                             | —                                                                                          |
| Анимации      | `--ease-*`, `--dur-*`                                                                                                             | —                                                                                          |
| Фокус         | `--focus-ring`                                                                                                                    | a11y-кольцо                                                                                |
| Фон страницы  | `--bg-page-gradient`                                                                                                              | декоративный wash; темы гасят его (`none`)                                                 |

### Правило статус-цветов (критично для темизации)

Палитра Tailwind (`text-red-600`, `bg-emerald-500`, `text-violet-600`, …) **не
тематизируется** и в тёмных/нестандартных темах выглядит сломанной. Используйте
семантические токены через arbitrary-классы:

| Нужно | ❌ Не так | ✅ Так |
|---|---|---|
| Опасность (текст) | `text-red-600` | `text-[color:var(--danger-fg-bold)]` |
| Опасность (фон) | `bg-red-50` | `bg-[var(--danger-bg-soft)]` |
| Успех/онлайн | `bg-emerald-500` | `bg-[var(--success-fg)]` |
| Спец/разработчик | `text-violet-600` | `text-[color:var(--special-fg)]` |
| Поверхность | `bg-white/60` | `bg-[var(--bg-surface)]` |
| Граница | `border-white/65` | `border-[color:var(--border-glass)]` |

`ink/cream/warm`-классы Tailwind (`text-ink-700`, `bg-ink-900`) **допустимы** — они
завязаны на палитру и тематизируются автоматически.

## Кнопки — канон `ui-btn`

Каноничный словарь — **`ui-btn`** ([`src/styles/primitives/buttons.css`](src/styles/primitives/buttons.css)):

| Класс | Назначение |
|---|---|
| `ui-btn` | база (нейтральная) |
| `ui-btn ui-btn-primary` | основное действие (акцент) |
| `ui-btn ui-btn-subtle` | второстепенное |
| `ui-btn ui-btn-danger` | деструктивное |
| `ui-btn ui-btn-icon` | иконочная (квадратная) |

Состояния (hover/active/disabled/focus-visible) уже зашиты. Чипы — `ui-chip` / `ui-chip-action`.

> **Deprecated, не использовать в новом коде:** `btn-primary`, `btn-secondary`,
> `btn-ghost`, `btn-danger`, `btn-danger-wide`, `glass-button`. Это исторические
> параллельные словари; мигрируются на `ui-btn` инкрементально (нужна визуальная QA
> при замене). `.btn-primary` ранее дублировался — теперь единое определение.

## Поля и поверхности

- Инпуты — `glass-input` (фокус через `--focus-ring`).
- Карточки/стекло — `glass`, `glossy`, токены `--bg-surface*` + `--shadow-glass*`.
- Модалки — общий примитив [`Modal`](src/components/Modal.tsx) (оверлей + центрирование
  + закрытие по фону/Esc). Не копируйте `fixed inset-0 bg-black/.. backdrop-blur`
  вручную.
- Контекстное меню — `ContextMenu` + хук `useContextMenu` (см.
  [`src/lib/useContextMenu.tsx`](src/lib/useContextMenu.tsx)).

## Известные follow-up (нужна визуальная QA)

1. **Цвета-категории `CalendarView`** (~38): теги событий `red/green/blue/yellow/
   purple/orange` — это НЕ статусы. Их нельзя мапить на `--danger/success/...`.
   Нужна отдельная система токенов `--event-{цвет}` (фон/текст/рамка), тематизируемая
   по темам. То же касается цветов ролей. До этого они остаются палитрой Tailwind.
2. Розовый акцент дня рождения (`text-pink-500`, иконка торта) — оставлен как
   фиксированный бренд-акцент; при желании вынести в `--birthday-fg`.
3. Полная миграция `btn-*`/`glass-button` → `ui-btn`.
4. Перевод оставшихся вручную собранных модалок на примитив `Modal`.

> Статус-цвета (danger/success/warning) уже сведены к токенам по всему приложению
> (было ~184 «прибитых» класса палитры → осталось ~45, и все они категориальные).
