"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bot,
  CalendarDays,
  ChevronDown,
  Hourglass,
  House,
  HousePlus,
  Images,
  Link2,
  Pencil,
  Settings,
  Info,
  LayoutGrid,
  MessageCircle,
  Network,
  Plus,
  Rss,
  StickyNote,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { type Chat, type Channel, type Family, type Me, type MyFamily } from "@/lib/api";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationBell from "@/components/NotificationBell";
import NotificationCenter from "@/components/NotificationCenter";
import MobileBottomNav, { type MobileNavCategory } from "@/components/MobileBottomNav";
import MobileProfileSheet from "@/components/MobileProfileSheet";
import {
  useNotifications,
  type Notification,
  type PresenceUpdateEvent,
} from "@/components/NotificationSystem";

export type AppSection = "chat" | "gallery" | "files" | "calendar" | "members" | "channels" | "notes" | "budget" | "reminders" | "tree" | "time-capsules" | "bots";

type NavCategory = "chat" | "plans" | "media" | "family";

type NavItem = {
  id: AppSection;
  icon: LucideIcon;
  label: string;
  desc: string;
};

type NavCategoryItem = {
  id: string;
  label: string;
  section?: AppSection;
  routeOnClick?: AppSection;
  disabled?: boolean;
  soon?: boolean;
};

type NavCategoryGroup = {
  id: string;
  label: string;
  items: NavCategoryItem[];
};

type SidebarCategory = {
  id: NavCategory;
  icon: LucideIcon;
  label: string;
  groups: NavCategoryGroup[];
};

const NAV_ITEMS: NavItem[] = [
  { id: "chat", icon: MessageCircle, label: "Чат", desc: "Общение семьи" },
  { id: "gallery", icon: Images, label: "Галерея", desc: "Фото и видео" },
  {
    id: "calendar",
    icon: CalendarDays,
    label: "Календарь",
    desc: "События и дни рождения",
  },
  { id: "budget", icon: Wallet, label: "Бюджет", desc: "Семейные расходы" },
  { id: "reminders", icon: AlarmClock, label: "Напоминания", desc: "Дела и события семьи" },
  { id: "time-capsules", icon: Hourglass, label: "Капсулы времени", desc: "Послания в будущее" },
  { id: "notes", icon: StickyNote, label: "Заметки", desc: "Личные и семейные заметки" },
  { id: "channels", icon: Rss, label: "Каналы", desc: "Объявления семьи" },
  { id: "members", icon: Users, label: "Участники", desc: "Члены семьи" },
  { id: "tree", icon: Network, label: "Древо", desc: "Семейное древо" },
  { id: "bots", icon: Bot, label: "Боты", desc: "Свои боты и токены" },
];

const SECTION_TO_CATEGORY: Record<AppSection, NavCategory> = {
  chat: "chat",
  channels: "chat",
  calendar: "plans",
  budget: "plans",
  notes: "plans",
  reminders: "plans",
  "time-capsules": "plans",
  gallery: "media",
  files: "media",
  members: "family",
  tree: "family",
  bots: "family",
};

const CATEGORY_DEFAULT_SECTION: Record<NavCategory, AppSection> = {
  chat: "chat",
  plans: "calendar",
  media: "gallery",
  family: "members",
};

// Короткие подписи категорий для мобильного нижнего меню.
const MOBILE_CATEGORY_LABELS: Record<NavCategory, string> = {
  chat: "Чат",
  plans: "Планы",
  media: "Медиа",
  family: "Семья",
};

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  {
    id: "chat",
    icon: MessageCircle,
    label: "Чаты",
    groups: [
      {
        id: "chat-conversations",
        label: "Беседы",
        items: [{ id: "chat", label: "Чаты", section: "chat" }],
      },
      {
        id: "chat-channels",
        label: "Каналы",
        items: [{ id: "channels", label: "Каналы", section: "channels" }],
      },
    ],
  },
  {
    id: "plans",
    icon: CalendarDays,
    label: "Планирование",
    groups: [
      {
        id: "plans-main",
        label: "Планы",
        items: [
          { id: "calendar", label: "Календарь", section: "calendar" },
          { id: "notes", label: "Заметки", section: "notes" },
          { id: "budget", label: "Бюджет", section: "budget" },
          { id: "reminders", label: "Напоминания", section: "reminders" },
          { id: "time-capsules", label: "Капсулы времени", section: "time-capsules" },
        ],
      },
    ],
  },
  {
    id: "media",
    icon: Images,
    label: "Медиа",
    groups: [
      {
        id: "media-main",
        label: "Медиа",
        items: [
          { id: "gallery", label: "Галерея", section: "gallery" },
          { id: "files", label: "Файлы", section: "files" },
        ],
      },
    ],
  },
  {
    id: "family",
    icon: Users,
    label: "Семья",
    groups: [
      {
        id: "family-main",
        label: "Семья",
        items: [
          { id: "members", label: "Участники", section: "members" },
          { id: "tree", label: "Древо", section: "tree" },
          { id: "bots", label: "Боты", section: "bots" },
          { id: "achievements", label: "Достижения", disabled: true, soon: true },
        ],
      },
    ],
  },
];

// Модель навигации для мобильного нижнего меню: 4 категории, в каждой — её
// разделы (выкидываем нереализованные пункты без section, напр. «Достижения»).
const MOBILE_NAV: MobileNavCategory[] = SIDEBAR_CATEGORIES.map((cat) => ({
  id: cat.id,
  label: MOBILE_CATEGORY_LABELS[cat.id],
  icon: cat.icon,
  sections: cat.groups
    .flatMap((g) => g.items)
    .filter((it): it is NavCategoryItem & { section: AppSection } =>
      Boolean(it.section) && !it.disabled,
    )
    .map((it) => ({ id: it.section, label: it.label })),
}));

type Props = {
  me: Me;
  family: Family;
  myFamilies: MyFamily[];
  isOwner: boolean;
  section: AppSection;
  onSection: (s: AppSection) => void;
  onFamilySwitch: (familyId: string) => void;
  onCreateFamily: () => void;
  onJoinFamily?: () => void;
  onRenameFamily?: (familyId: string, currentName: string) => void;
  onOpenFamilySettings?: () => void;
  onLogout: () => void;
  onMeUpdate: (m: Me) => void;
  onChatOpen?: (chatId: string) => void;
  onPresenceUpdate?: (event: PresenceUpdateEvent) => void;
  onFamilyDeleted?: (familyId: string) => void;
  chats: Chat[];
  activeChatId: string | null;
  channels: Channel[];
  selectedChannelId: string | null;
  onChatSelect: (id: string) => void;
  onChannelSelect: (id: string) => void;
  onCreateChat?: () => void;
  children: React.ReactNode;
};

const TOAST_ICONS: Record<Notification["type"], LucideIcon> = {
  mention: MessageCircle,
  member_joined: UserPlus,
  member_kicked: UserMinus,
  calendar_event: CalendarDays,
  capsule_opened: Hourglass,
  info: Info,
};

export default function AppLayout({
  me,
  family,
  myFamilies,
  isOwner,
  section,
  onSection,
  onFamilySwitch,
  onCreateFamily,
  onJoinFamily,
  onRenameFamily,
  onOpenFamilySettings,
  onLogout,
  onMeUpdate,
  onChatOpen,
  onPresenceUpdate,
  onFamilyDeleted,
  chats,
  activeChatId,
  channels,
  selectedChannelId,
  onChatSelect,
  onChannelSelect,
  onCreateChat,
  children,
}: Props) {
  const {
    toasts,
    unread,
    allNotifications,
    dismiss,
    clearUnread,
    clearAll,
    countsByType,
  } = useNotifications(family.id, me.username, {
    onPresenceUpdate,
    onFamilyDeleted,
  });

  const [isCenterOpen, setCenterOpen] = useState(false);
  const [isFamilyMenuOpen, setFamilyMenuOpen] = useState(false);
  const [isMobileProfileOpen, setMobileProfileOpen] = useState(false);
  const familyMenuRef = useRef<HTMLDivElement>(null);

  const meInitial = me.display_name?.[0]?.toUpperCase() ?? "?";

  const current = useMemo(
    () => NAV_ITEMS.find((n) => n.id === section) ?? NAV_ITEMS[0],
    [section],
  );
  const CurrentIcon = current.icon;

  const [expandedCategories, setExpandedCategories] = useState<Set<NavCategory>>(() => {
    try {
      const saved = localStorage.getItem("lentik_nav_expanded");
      return saved ? new Set(JSON.parse(saved)) : new Set(["chat"]);
    } catch {
      return new Set(["chat"]);
    }
  });

  const toggleCategory = useCallback((categoryId: NavCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      try { localStorage.setItem("lentik_nav_expanded", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const handleContextItemClick = useCallback((item: NavCategoryItem) => {
    if (item.disabled) return;
    const targetSection = item.section ?? item.routeOnClick;
    if (targetSection && targetSection !== section) onSection(targetSection);
  }, [section, onSection]);

  useMemo(() => SECTION_TO_CATEGORY[section], [section]);

  useEffect(() => {
    if (!isFamilyMenuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!familyMenuRef.current?.contains(event.target as Node)) {
        setFamilyMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isFamilyMenuOpen]);

  useEffect(() => {
    setFamilyMenuOpen(false);
  }, [family.id]);

  return (
    <div className="app-layout">
      <aside className="app-sidebar glass-sidebar glossy">
          <div className="app-sidebar-brand" ref={familyMenuRef}>
            <div className="app-family-menu-anchor">
              <button
                type="button"
                className={`app-brand-mark app-brand-home-btn ${isFamilyMenuOpen ? "active" : ""}`}
                onClick={() => setFamilyMenuOpen((open) => !open)}
                aria-label="Открыть список семей"
                aria-haspopup="menu"
                aria-expanded={isFamilyMenuOpen}
              >
                <House className="w-[15px] h-[15px]" strokeWidth={2.2} />
              </button>

              {isFamilyMenuOpen && (
                <div className="app-family-menu glass-dropdown" role="menu" aria-label="Список семей">
                  <div className="app-family-menu-list">
                    {myFamilies.map((item) => {
                      const isActiveFamily = item.family_id === family.id;
                      const canRename = item.role === "owner" && onRenameFamily;
                      return (
                        <div
                          key={item.family_id}
                          className={`app-family-menu-item flex items-center gap-1.5 ${isActiveFamily ? "active" : ""}`}
                        >
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActiveFamily}
                            className="flex-1 min-w-0 text-left truncate"
                            onClick={() => {
                              setFamilyMenuOpen(false);
                              if (!isActiveFamily) onFamilySwitch(item.family_id);
                            }}
                            title={item.family_name}
                          >
                            {item.family_name}
                          </button>
                          {canRename && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFamilyMenuOpen(false);
                                onRenameFamily?.(item.family_id, item.family_name);
                              }}
                              className="w-6 h-6 shrink-0 rounded-md grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition"
                              aria-label={`Переименовать семью «${item.family_name}»`}
                              title="Переименовать"
                            >
                              <Pencil className="w-3 h-3" strokeWidth={2.3} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="app-family-menu-footer flex flex-col gap-1">
                    <button
                      type="button"
                      className="app-family-create"
                      onClick={() => {
                        setFamilyMenuOpen(false);
                        onCreateFamily();
                      }}
                    >
                      <HousePlus className="w-[14px] h-[14px]" strokeWidth={2.2} />
                      <span>Создать семью</span>
                    </button>
                    {onJoinFamily && (
                      <button
                        type="button"
                        className="app-family-create"
                        onClick={() => {
                          setFamilyMenuOpen(false);
                          onJoinFamily();
                        }}
                      >
                        <Link2 className="w-[14px] h-[14px]" strokeWidth={2.2} />
                        <span>Вступить по приглашению</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="app-family-title-row min-w-0 w-full"
                onClick={() => setFamilyMenuOpen((open) => !open)}
                aria-label="Открыть список семей"
                aria-expanded={isFamilyMenuOpen}
              >
                <span className="font-display text-[1.06rem] text-ink-900 leading-tight tracking-tight truncate">
                  {family.name}
                </span>
                <ChevronDown
                  className={`app-family-chevron ${isFamilyMenuOpen ? "open" : ""}`}
                  strokeWidth={2.3}
                  aria-hidden
                />
              </button>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[11px] text-ink-400 font-body truncate flex-1">
                  Семейное пространство
                </p>
                {onOpenFamilySettings && (
                  <button
                    type="button"
                    onClick={onOpenFamilySettings}
                    className="w-7 h-7 rounded-md grid place-items-center text-ink-400 hover:text-ink-900 hover:bg-white/60 transition shrink-0"
                    aria-label="Настройки семьи"
                    data-tooltip="Настройки семьи"
                    data-testid="family-settings-btn"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mx-4 mb-3">
            <hr className="divider-warm" />
          </div>

          <nav className="app-sidebar-nav sidebar-scroll" aria-label="Навигация">
            {SIDEBAR_CATEGORIES.map((category) => {
              const isExpanded = expandedCategories.has(category.id);
              const Icon = category.icon;
              return (
                <div key={category.id} className="nav-accordion-group">
                  <button
                    type="button"
                    className="nav-accordion-header"
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={isExpanded}
                  >
                    <Icon className="w-[14px] h-[14px] shrink-0" strokeWidth={2.2} />
                    <span>{category.label}</span>
                    <ChevronDown
                      className={`nav-accordion-chevron ${isExpanded ? "open" : ""}`}
                      strokeWidth={2.3}
                      aria-hidden
                    />
                  </button>

                  {isExpanded && (
                    <div className="nav-accordion-items">
                      {category.groups.map((group) =>
                        group.items.map((item) => {
                          const active = !!item.section && section === item.section;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`nav-item ${active ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                              onClick={() => handleContextItemClick(item)}
                              disabled={item.disabled}
                              aria-current={active ? "page" : undefined}
                            >
                              <span className="truncate">{item.label}</span>
                              {item.soon && <span className="nav-soon-badge">скоро</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="app-family-card-wrap">
            <div className="app-family-card glass-card glossy">
              <div className="flex -space-x-2">
                {(family.members ?? []).slice(0, 5).map((m) => (
                  <div
                    key={m.username}
                    className="app-mini-avatar"
                    title={m.display_name}
                    aria-label={m.display_name}
                  >
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (m.display_name?.[0] ?? "?")
                    )}
                  </div>
                ))}
              </div>

              <span className="text-[11px] text-ink-400 font-body whitespace-nowrap">
                {family.members?.length ?? 0} участников
              </span>
            </div>
          </div>

          <ProfileMenu
            me={me}
            isOwner={isOwner}
            onLogout={onLogout}
            onUpdate={onMeUpdate}
          />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="app-topbar glass-topbar glossy">
          <div className="flex items-center gap-3 min-w-0">
            <div className="glass-icon glossy w-[40px] h-[40px] rounded-[16px] flex items-center justify-center shrink-0">
              <CurrentIcon className="w-[19px] h-[19px] text-ink-700" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[1.12rem] text-ink-900 leading-tight tracking-tight truncate">
                {current.label}
              </h1>
              <p className="text-[11px] text-ink-500 font-body mt-0.5 truncate max-w-[55vw]">
                {current.desc}
              </p>
            </div>
          </div>

          <div className="app-topbar-actions">
            <button
              onClick={() => setMobileProfileOpen(true)}
              className="md:hidden w-11 h-11 rounded-full overflow-hidden grid place-items-center shrink-0 border border-[color:var(--border-glass-strong)] bg-gradient-to-br from-warm-300 via-warm-400 to-warm-500 text-white font-display text-sm"
              type="button"
              aria-label="Профиль и семьи"
              title="Профиль и семьи"
            >
              {me.avatar_url ? (
                <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                meInitial
              )}
            </button>

            <button
              onClick={() => setCenterOpen(true)}
              className="ui-btn ui-btn-icon"
              type="button"
              aria-label="Открыть центр уведомлений"
              title="Центр уведомлений"
            >
              <LayoutGrid className="w-[14px] h-[14px]" aria-hidden />
            </button>

            <NotificationBell
              unread={unread}
              notifications={allNotifications}
              onClear={clearUnread}
              onDismiss={dismiss}
              onChatOpen={onChatOpen}
              onOpenCenter={() => setCenterOpen(true)}
            />
          </div>
        </header>

        <main className="app-main page-enter">{children}</main>
      </div>

      <NotificationCenter
        open={isCenterOpen}
        notifications={allNotifications}
        unread={unread}
        countsByType={countsByType}
        onDismiss={dismiss}
        onClearUnread={clearUnread}
        onClearAll={clearAll}
        onClose={() => setCenterOpen(false)}
        onChatOpen={onChatOpen}
      />

      <MobileBottomNav section={section} onSection={onSection} categories={MOBILE_NAV} />

      {isMobileProfileOpen && (
        <MobileProfileSheet
          me={me}
          activeFamilyId={family.id}
          myFamilies={myFamilies}
          onClose={() => setMobileProfileOpen(false)}
          onFamilySwitch={onFamilySwitch}
          onCreateFamily={onCreateFamily}
          onJoinFamily={onJoinFamily}
          onRenameFamily={onRenameFamily}
          onOpenFamilySettings={onOpenFamilySettings}
          onLogout={onLogout}
          onMeUpdate={onMeUpdate}
        />
      )}

      {toasts.length > 0 && (
        <div
          className="toast-wrap fixed bottom-5 right-5 z-[70] flex flex-col gap-2.5 items-end pointer-events-none"
          aria-live="polite"
          aria-relevant="additions"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Notification;
  onDismiss: (id: string) => void;
}) {
  const Icon = TOAST_ICONS[toast.type];

  return (
    <div className={`toast-glass glossy pointer-events-auto ${toast.type}`}>
      <div className="toast-glass-icon" aria-hidden>
        <Icon className="w-4 h-4 text-ink-600" strokeWidth={2.1} />
      </div>

      <div className="flex-1 min-w-0 pl-0.5">
        <p className="text-sm font-semibold text-ink-900 font-body leading-tight">
          {toast.title}
        </p>
        <p className="text-xs text-ink-500 font-body mt-0.5 line-clamp-2 leading-relaxed">
          {toast.body}
        </p>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="toast-glass-close"
        aria-label="Закрыть"
      >
        <X className="w-[14px] h-[14px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}
