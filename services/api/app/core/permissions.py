"""Битовое поле прав.

Каждый бит = одно разрешение. Финальные права участника = OR прав всех его ролей.
ADMINISTRATOR (последний бит) шунтирует все проверки.

Будущие override-ы каналов/чатов будут давать allow/deny битовые поля,
которые применяются поверх базы: base = (base & ~deny) | allow.
"""

from __future__ import annotations

from enum import IntFlag


class Perm(IntFlag):
    NONE = 0

    # ── Просмотр и базовое участие ──────────────────────────────────────────
    VIEW_CHANNEL = 1 << 0  # Видеть канал/чат
    READ_HISTORY = 1 << 1  # Читать историю сообщений

    # ── Отправка контента ───────────────────────────────────────────────────
    SEND_MESSAGES = 1 << 2
    ATTACH_FILES = 1 << 3
    EMBED_LINKS = 1 << 4
    ADD_REACTIONS = 1 << 5
    MENTION_EVERYONE = 1 << 6
    SEND_VOICE = 1 << 7

    # ── Управление контентом ───────────────────────────────────────────────
    MANAGE_OWN_MESSAGES = 1 << 8   # Редактировать/удалять СВОИ
    MANAGE_MESSAGES = 1 << 9       # Удалять/закреплять ЛЮБЫЕ
    MANAGE_CHANNELS = 1 << 10      # Создавать/настраивать каналы и чаты

    # ── Управление семьёй ───────────────────────────────────────────────────
    MANAGE_ROLES = 1 << 11         # Создавать/редактировать роли
    KICK_MEMBERS = 1 << 12
    CREATE_INVITES = 1 << 13
    MANAGE_FAMILY = 1 << 14        # Переименовать, удалить, экспорт
    VIEW_AUDIT_LOG = 1 << 15

    # ── Спец-функции ────────────────────────────────────────────────────────
    ACCESS_18PLUS = 1 << 16        # Право видеть 18+ контент
    MANAGE_GALLERY = 1 << 17
    MANAGE_CALENDAR = 1 << 18
    MANAGE_BUDGET = 1 << 19

    # Шунтирующий бит — даёт все права (включая будущие).
    # Намеренно держим бит в пределах 32-х, чтобы значение спокойно влезало
    # в JS Number без потери точности (BigInt не нужен).
    ADMINISTRATOR = 1 << 31


# ─── Группировка прав для UI ────────────────────────────────────────────────

PERM_GROUPS: list[tuple[str, list[tuple[Perm, str, str]]]] = [
    (
        "Просмотр",
        [
            (Perm.VIEW_CHANNEL, "Видеть канал", "Без этого права канал/чат вообще не виден."),
            (Perm.READ_HISTORY, "Читать историю", "Доступ к прошлым сообщениям."),
        ],
    ),
    (
        "Отправка",
        [
            (Perm.SEND_MESSAGES, "Отправлять сообщения", "Писать в чат или постить в канал."),
            (Perm.ATTACH_FILES, "Прикреплять файлы", "Картинки, видео, документы."),
            (Perm.EMBED_LINKS, "Превью ссылок", "Разворачивать карточки сайтов."),
            (Perm.ADD_REACTIONS, "Ставить реакции", "Добавлять эмодзи на сообщения."),
            (Perm.MENTION_EVERYONE, "Упоминать @everyone", "Дёргать всю семью разом."),
            (Perm.SEND_VOICE, "Голосовые сообщения", "Записывать аудио."),
        ],
    ),
    (
        "Управление контентом",
        [
            (Perm.MANAGE_OWN_MESSAGES, "Редактировать свои", "Изменять и удалять только собственные сообщения."),
            (Perm.MANAGE_MESSAGES, "Управлять любыми", "Удалять и закреплять сообщения других."),
            (Perm.MANAGE_CHANNELS, "Управлять каналами", "Создавать, настраивать, удалять каналы и чаты."),
        ],
    ),
    (
        "Семья",
        [
            (Perm.MANAGE_ROLES, "Управлять ролями", "Создавать роли, менять их права и назначать участникам."),
            (Perm.KICK_MEMBERS, "Исключать участников", "Удалять людей из семьи."),
            (Perm.CREATE_INVITES, "Создавать приглашения", "Генерировать ссылки для вступления."),
            (Perm.MANAGE_FAMILY, "Настройки семьи", "Переименовать, удалить пространство, экспорт."),
            (Perm.VIEW_AUDIT_LOG, "Журнал аудита", "Видеть лог действий в семье."),
        ],
    ),
    (
        "Контент",
        [
            (Perm.ACCESS_18PLUS, "Доступ к 18+", "Видеть каналы и чаты с пометкой 18+."),
            (Perm.MANAGE_GALLERY, "Управление галереей", "Удалять чужие фото и видео."),
            (Perm.MANAGE_CALENDAR, "Управление календарём", "Редактировать чужие события."),
            (Perm.MANAGE_BUDGET, "Управление бюджетом", "Удалять чужие траты."),
        ],
    ),
    (
        "Опасные",
        [
            (Perm.ADMINISTRATOR, "Администратор", "Полный доступ ко всем функциям. Шунтирует любые ограничения."),
        ],
    ),
]


# ─── Пресет-роли ────────────────────────────────────────────────────────────


def _bits(*perms: Perm) -> int:
    out = 0
    for p in perms:
        out |= int(p)
    return out


PRESET_OWNER_PERMS = _bits(Perm.ADMINISTRATOR)

PRESET_COOWNER_PERMS = _bits(
    Perm.VIEW_CHANNEL, Perm.READ_HISTORY,
    Perm.SEND_MESSAGES, Perm.ATTACH_FILES, Perm.EMBED_LINKS,
    Perm.ADD_REACTIONS, Perm.MENTION_EVERYONE, Perm.SEND_VOICE,
    Perm.MANAGE_OWN_MESSAGES, Perm.MANAGE_MESSAGES, Perm.MANAGE_CHANNELS,
    Perm.MANAGE_ROLES, Perm.KICK_MEMBERS, Perm.CREATE_INVITES,
    Perm.VIEW_AUDIT_LOG, Perm.ACCESS_18PLUS,
    Perm.MANAGE_GALLERY, Perm.MANAGE_CALENDAR, Perm.MANAGE_BUDGET,
)

PRESET_PARENT_PERMS = _bits(
    Perm.VIEW_CHANNEL, Perm.READ_HISTORY,
    Perm.SEND_MESSAGES, Perm.ATTACH_FILES, Perm.EMBED_LINKS,
    Perm.ADD_REACTIONS, Perm.MENTION_EVERYONE, Perm.SEND_VOICE,
    Perm.MANAGE_OWN_MESSAGES, Perm.MANAGE_MESSAGES,
    Perm.CREATE_INVITES, Perm.ACCESS_18PLUS,
    Perm.MANAGE_GALLERY, Perm.MANAGE_CALENDAR, Perm.MANAGE_BUDGET,
)

PRESET_TEEN_PERMS = _bits(
    Perm.VIEW_CHANNEL, Perm.READ_HISTORY,
    Perm.SEND_MESSAGES, Perm.ATTACH_FILES, Perm.EMBED_LINKS,
    Perm.ADD_REACTIONS, Perm.SEND_VOICE,
    Perm.MANAGE_OWN_MESSAGES,
)

PRESET_CHILD_PERMS = _bits(
    Perm.VIEW_CHANNEL, Perm.READ_HISTORY,
    Perm.SEND_MESSAGES,
    Perm.ADD_REACTIONS,
    Perm.MANAGE_OWN_MESSAGES,
)

# @everyone — базовые права для всех, аккуратные дефолты.
PRESET_EVERYONE_PERMS = _bits(
    Perm.VIEW_CHANNEL, Perm.READ_HISTORY,
    Perm.SEND_MESSAGES, Perm.ATTACH_FILES, Perm.EMBED_LINKS,
    Perm.ADD_REACTIONS, Perm.SEND_VOICE,
    Perm.MANAGE_OWN_MESSAGES,
)


PRESET_DEFS: list[dict] = [
    # priority: меньше = выше в иерархии (применяется первой при override-разборе)
    {
        "slug": "owner",
        "name": "Владелец",
        "color": "#f59e0b",
        "priority": 0,
        "permissions": PRESET_OWNER_PERMS,
        "is_system": True,
    },
    {
        "slug": "coowner",
        "name": "Со-владелец",
        "color": "#ef4444",
        "priority": 10,
        "permissions": PRESET_COOWNER_PERMS,
        "is_system": False,
    },
    {
        "slug": "parent",
        "name": "Родитель",
        "color": "#10b981",
        "priority": 20,
        "permissions": PRESET_PARENT_PERMS,
        "is_system": False,
    },
    {
        "slug": "teen",
        "name": "Подросток",
        "color": "#3b82f6",
        "priority": 30,
        "permissions": PRESET_TEEN_PERMS,
        "is_system": False,
    },
    {
        "slug": "child",
        "name": "Ребёнок",
        "color": "#8b5cf6",
        "priority": 40,
        "permissions": PRESET_CHILD_PERMS,
        "is_system": False,
    },
    {
        "slug": "everyone",
        "name": "@everyone",
        "color": "#a1a1aa",
        "priority": 100,  # самая низкая в стеке
        "permissions": PRESET_EVERYONE_PERMS,
        "is_system": True,
    },
]


def has_perm(bits: int, perm: Perm) -> bool:
    """Полная проверка: или бит установлен, или есть ADMINISTRATOR."""
    if bits & int(Perm.ADMINISTRATOR):
        return True
    return bool(bits & int(perm))


# Плоская карта { бит → человекочитаемая метка } из PERM_GROUPS.
PERM_LABELS: dict[int, str] = {
    int(perm): label for _group, perms in PERM_GROUPS for (perm, label, _desc) in perms
}


def permission_labels(bits: int) -> list[str]:
    """Список меток выставленных битов (в порядке объявления)."""
    return [label for bit, label in PERM_LABELS.items() if bits & bit]


def diff_permissions(old: int, new: int) -> dict[str, list[str]]:
    """Возвращает { added: [...], removed: [...] } метками прав между двумя битполями."""
    added_bits = new & ~old
    removed_bits = old & ~new
    return {
        "added": [label for bit, label in PERM_LABELS.items() if added_bits & bit],
        "removed": [label for bit, label in PERM_LABELS.items() if removed_bits & bit],
    }
