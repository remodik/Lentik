"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChevronDown,
  House,
  HousePlus,
  Images,
  Info,
  LayoutGrid,
  MessageCircle,
  Plus,
  Rss,
  StickyNote,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { type Chat, type Channel, type Family, type Me, type MyFamily } from "@/lib/api";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationBell from "@/components/NotificationBell";
import NotificationCenter from "@/components/NotificationCenter";
import MobileBottomNav from "@/components/MobileBottomNav";
import {
  useNotifications,
  type Notification,
  type PresenceUpdateEvent,
} from "@/components/NotificationSystem";

export type AppSection = "chat" | "gallery" | "calendar" | "members" | "channels" | "notes";

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
  { id: "notes", icon: StickyNote, label: "Заметки", desc: "Личные и семейные заметки" },
  { id: "channels", icon: Rss, label: "Каналы", desc: "Объявления семьи" },
  { id: "members", icon: Users, label: "Участники", desc: "Члены семьи" },
];

const SECTION_TO_CATEGORY: Record<AppSection, NavCategory> = {
  chat: "chat",
  channels: "chat",
  calendar: "plans",
  notes: "plans",
  gallery: "media",
  members: "family",
};

const CATEGORY_DEFAULT_SECTION: Record<NavCategory, AppSection> = {
  chat: "chat",
  plans: "calendar",
  media: "gallery",
  family: "members",
};

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  {
    id: "chat",
    icon: MessageCircle,
    label: "Chat",
    groups: [
      {
        id: "chat-conversations",
        label: "Беседы",
        items: [{ id: "chat", label: "Семейный чат", section: "chat" }],
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
    label: "Plans",
    groups: [
      {
        id: "plans-main",
        label: "Планы",
        items: [
          { id: "calendar", label: "Календарь", section: "calendar" },
          { id: "notes", label: "Заметки", section: "notes" },
          { id: "reminders", label: "Напоминания", disabled: true, soon: true },
          { id: "time-capsules", label: "Капсулы времени", disabled: true, soon: true },
          { id: "budget", label: "Бюджет", disabled: true, soon: true },
        ],
      },
    ],
  },
  {
    id: "media",
    icon: Images,
    label: "Media",
    groups: [
      {
        id: "media-main",
        label: "Медиа",
        items: [
          { id: "gallery", label: "Галерея", section: "gallery" },
          { id: "files", label: "Файлы", routeOnClick: "gallery" },
          { id: "video", label: "Видео", disabled: true, soon: true },
        ],
      },
    ],
  },
  {
    id: "family",
    icon: Users,
    label: "Family",
    groups: [
      {
        id: "family-main",
        label: "Семья",
        items: [
          { id: "members", label: "Участники", section: "members" },
          { id: "tree", label: "Древо", disabled: true, soon: true },
          { id: "achievements", label: "Достижения", disabled: true, soon: true },
        ],
      },
    ],
  },
];

type Props = {
  me: Me;
  family: Family;
  myFamilies: MyFamily[];
  isOwner: boolean;
  section: AppSection;
  onSection: (s: AppSection) => void;
  onFamilySwitch: (familyId: string) => void;
  onCreateFamily: () => void;
  onLogout: () => void;
  onMeUpdate: (m: Me) => void;
  onChatOpen?: (chatId: string) => void;
  onPresenceUpdate?: (event: PresenceUpdateEvent) => void;
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
  onLogout,
  onMeUpdate,
  onChatOpen,
  onPresenceUpdate,
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
  });

  const [isCenterOpen, setCenterOpen] = useState(false);
  const [isFamilyMenuOpen, setFamilyMenuOpen] = useState(false);
  const familyMenuRef = useRef<HTMLDivElement>(null);

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

  const activeCategory = useMemo(() => SECTION_TO_CATEGORY[section], [section]);

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
          <div className="app-sidebar-brand">
            <div className="app-family-menu-anchor" ref={familyMenuRef}>
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
                      return (
                        <button
                          key={item.family_id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActiveFamily}
                          className={`app-family-menu-item ${isActiveFamily ? "active" : ""}`}
                          onClick={() => {
                            setFamilyMenuOpen(false);
                            if (!isActiveFamily) onFamilySwitch(item.family_id);
                          }}
                          title={item.family_name}
                        >
                          <span className="truncate">{item.family_name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="app-family-menu-footer">
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
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <button
                type="button"
                className="app-family-title-row"
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
              <p className="text-[11px] text-ink-400 font-body mt-0.5 truncate">
                Семейное пространство
              </p>
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

      <MobileBottomNav section={section} onSection={onSection} />

      {toasts.length > 0 && (
        <div
          className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2.5 items-end pointer-events-none"
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