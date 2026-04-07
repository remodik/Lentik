"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  Info,
  MessageCircle,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import type { Notification } from "@/components/NotificationSystem";

type FilterKey = "all" | "unread" | Notification["type"];

type Props = {
  open: boolean;
  notifications: Notification[];
  unread: number;
  countsByType: Record<Notification["type"], number>;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onClearUnread: () => void;
  onClearAll: () => void;
  onChatOpen?: (chatId: string) => void;
};

const ICONS: Record<Notification["type"], LucideIcon> = {
  mention: MessageCircle,
  member_joined: UserPlus,
  member_kicked: UserMinus,
  calendar_event: CalendarDays,
  info: Info,
};

const ACCENT: Record<Notification["type"], string> = {
  mention: "#c4956a",
  member_joined: "#4ade80",
  member_kicked: "#f87171",
  calendar_event: "#60a5fa",
  info: "#94a3b8",
};

const ICON_BG: Record<Notification["type"], string> = {
  mention: "rgba(196,149,106,0.18)",
  member_joined: "rgba(74,222,128,0.18)",
  member_kicked: "rgba(248,113,113,0.18)",
  calendar_event: "rgba(96,165,250,0.18)",
  info: "rgba(148,163,184,0.14)",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "Только что";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

function filterLabel(key: FilterKey) {
  switch (key) {
    case "all":
      return "Все";
    case "unread":
      return "Непрочитанные";
    case "mention":
      return "Упоминания";
    case "calendar_event":
      return "Календарь";
    case "member_joined":
      return "Вступления";
    case "member_kicked":
      return "Исключения";
    case "info":
      return "Системные";
    default:
      return key;
  }
}

export default function NotificationCenter({
  open,
  notifications,
  unread,
  countsByType,
  onClose,
  onDismiss,
  onClearUnread,
  onClearAll,
  onChatOpen,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const onPointerDown = (e: PointerEvent) => {
      const el = drawerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (unread > 0) onClearUnread();
  }, [open, unread, onClearUnread]);

  useEffect(() => {
    if (!notifications.length) {
      setFilter("all");
      return;
    }

    if (filter === "all") return;

    const stillExists =
      filter === "unread"
        ? notifications.some((n) => !n.read)
        : notifications.some((n) => n.type === filter);

    if (!stillExists) setFilter("all");
  }, [notifications, filter]);

  const tabs = useMemo(
    () => [
      { key: "all" as const, count: notifications.length },
      { key: "unread" as const, count: notifications.filter((n) => !n.read).length },
      { key: "mention" as const, count: countsByType.mention },
      { key: "calendar_event" as const, count: countsByType.calendar_event },
      {
        key: "member_joined" as const,
        count: countsByType.member_joined + countsByType.member_kicked,
      },
      { key: "info" as const, count: countsByType.info },
    ],
    [notifications, countsByType],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.read);
    if (filter === "member_joined") {
      return notifications.filter(
        (n) => n.type === "member_joined" || n.type === "member_kicked",
      );
    }
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  if (!open) return null;

  return (
    <div className="notif-center-overlay" role="presentation">
      <div
        ref={drawerRef}
        className="notif-center-drawer animate-slide-left"
        role="dialog"
        aria-label="Центр уведомлений"
        aria-modal="true"
      >
        <div className="notif-center-head">
          <div className="min-w-0">
            <h2 className="notif-center-title">Центр уведомлений</h2>
            <p className="notif-center-sub">
              {notifications.length} всего · {notifications.filter((n) => !n.read).length} непрочитанных
            </p>
          </div>

          <button
            onClick={onClose}
            className="ui-btn ui-btn-icon"
            type="button"
            aria-label="Закрыть центр уведомлений"
            title="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </div>

        <div className="notif-center-tabs sidebar-scroll" role="tablist" aria-label="Фильтры">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`notif-center-tab ${filter === tab.key ? "active" : ""}`}
              onClick={() => setFilter(tab.key)}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              disabled={tab.count === 0 && tab.key !== "all"}
            >
              <span>{filterLabel(tab.key)}</span>
              <span className="notif-center-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="notif-center-actions">
          <button
            onClick={onClearUnread}
            className="ui-btn ui-btn-subtle"
            type="button"
            disabled={unread === 0 && notifications.every((n) => n.read)}
          >
            Очистить непрочитанные
          </button>
          <button
            onClick={onClearAll}
            className="ui-btn ui-btn-danger"
            type="button"
            disabled={notifications.length === 0}
          >
            Очистить всё
          </button>
        </div>

        <div className="notif-center-list sidebar-scroll">
          {filtered.length === 0 ? (
            <div className="notif-center-empty">
              <div className="glass-icon glossy w-14 h-14 rounded-2xl grid place-items-center">
                <Bell className="w-6 h-6 text-ink-500" strokeWidth={2.1} />
              </div>
              <p className="text-sm font-semibold text-ink-700 font-body">
                Здесь пока пусто
              </p>
              <p className="text-xs text-ink-400 font-body text-center leading-relaxed">
                Уведомления появятся, когда в семье произойдут новые события.
              </p>
            </div>
          ) : (
            filtered.map((n) => {
              const Icon = ICONS[n.type];

              return (
                <article
                  key={n.id}
                  className={`notif-center-item ${n.chat_id ? "clickable" : ""}`}
                  onClick={() => {
                    if (!n.chat_id) return;
                    onChatOpen?.(n.chat_id);
                    onClose();
                  }}
                  role={n.chat_id ? "button" : undefined}
                  tabIndex={n.chat_id ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!n.chat_id) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChatOpen?.(n.chat_id);
                      onClose();
                    }
                  }}
                >
                  <span
                    className="notif-center-accent"
                    style={{ background: ACCENT[n.type] }}
                    aria-hidden
                  />

                  <div
                    className="notif-center-icon"
                    style={{ background: ICON_BG[n.type] }}
                    aria-hidden
                  >
                    <Icon className="w-4 h-4 text-ink-700" strokeWidth={2.1} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="notif-center-item-head">
                      <p className="notif-center-item-title">{n.title}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss(n.id);
                        }}
                        className="notif-center-x"
                        type="button"
                        aria-label="Удалить уведомление"
                      >
                        <X className="w-4 h-4" strokeWidth={2.2} />
                      </button>
                    </div>

                    <p className="notif-center-item-body">{n.body}</p>
                    <p className="notif-center-item-time">{timeAgo(n.timestamp)}</p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
