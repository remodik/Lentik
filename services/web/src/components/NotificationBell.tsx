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

type Props = {
  unread: number;
  notifications: Notification[];
  onClear: () => void;
  onDismiss: (id: string) => void;
  onChatOpen?: (chatId: string) => void;
  onOpenCenter?: () => void;
};

const ICONS: Record<Notification["type"], LucideIcon> = {
  mention: MessageCircle,
  member_joined: UserPlus,
  member_kicked: UserMinus,
  calendar_event: CalendarDays,
  info: Info,
};

const ICON_COLORS: Record<Notification["type"], string> = {
  mention: "rgba(196,149,106,0.18)",
  member_joined: "rgba(74,222,128,0.18)",
  member_kicked: "rgba(248,113,113,0.18)",
  calendar_event: "rgba(96,165,250,0.18)",
  info: "rgba(148,163,184,0.14)",
};

const ACCENT: Record<Notification["type"], string> = {
  mention: "#c4956a",
  member_joined: "#4ade80",
  member_kicked: "#f87171",
  calendar_event: "#60a5fa",
  info: "#94a3b8",
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

export default function NotificationBell({
  unread,
  notifications,
  onClear,
  onDismiss,
  onChatOpen,
  onOpenCenter,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && unread > 0) onClear();
  }, [open, unread, onClear]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const countLabel = useMemo(() => {
    const n = notifications.length;
    if (n === 0) return "";
    if (n === 1) return "1 уведомление";
    if (n >= 2 && n <= 4) return `${n} уведомления`;
    return `${n} уведомлений`;
  }, [notifications.length]);

  const recent = notifications.slice(0, 6);

  function handleClearAll() {
    notifications.forEach((n) => onDismiss(n.id));
  }

  return (
    <div ref={rootRef} className="notif-root">
      <button
        ref={buttonRef}
        className={`notif-bell-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Уведомления"
        aria-expanded={open}
        type="button"
      >
        <Bell className="w-4 h-4 text-ink-600" strokeWidth={2.2} />
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="notif-panel glossy"
          role="dialog"
          aria-label="Уведомления"
        >
          <div className="notif-panel-header">
            <div className="min-w-0">
              <p className="notif-title">Уведомления</p>
              {notifications.length > 0 && <p className="notif-sub">{countLabel}</p>}
            </div>

            {notifications.length > 0 && (
              <div className="notif-actions">
                <button
                  onClick={onClear}
                  className="notif-action-btn"
                  title="Отметить все как прочитанные"
                  type="button"
                >
                  Прочитано
                </button>

                <button
                  onClick={handleClearAll}
                  className="notif-action-btn"
                  title="Удалить все уведомления"
                  type="button"
                >
                  Очистить
                </button>
              </div>
            )}
          </div>

          <div className="notif-list sidebar-scroll">
            {recent.length === 0 ? (
              <EmptyState />
            ) : (
              recent.map((n) => {
                const Icon = ICONS[n.type];
                return (
                  <div
                    key={n.id}
                    className={`notif-item ${n.chat_id ? "clickable" : ""}`}
                    onClick={() => {
                      if (!n.chat_id) return;
                      onChatOpen?.(n.chat_id);
                      setOpen(false);
                    }}
                    role={n.chat_id ? "button" : undefined}
                    tabIndex={n.chat_id ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!n.chat_id) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChatOpen?.(n.chat_id);
                        setOpen(false);
                      }
                    }}
                  >
                    <div
                      className="notif-accent"
                      style={{ background: ACCENT[n.type] }}
                      aria-hidden
                    />

                    <div
                      className="notif-item-icon"
                      style={{ background: ICON_COLORS[n.type] }}
                    >
                      <Icon className="w-4 h-4 text-ink-700" strokeWidth={2.1} />
                    </div>

                    <div className="notif-item-main">
                      <div className="notif-item-top">
                        <p className="notif-item-title">{n.title}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismiss(n.id);
                          }}
                          className="notif-x"
                          aria-label="Удалить уведомление"
                          title="Удалить"
                          type="button"
                        >
                          <X className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      </div>

                      <p className="notif-item-body">{n.body}</p>
                      <p className="notif-time">{timeAgo(n.timestamp)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="notif-footer">
            <p className="notif-hint">Esc — закрыть</p>
            <button
              onClick={() => {
                setOpen(false);
                onOpenCenter?.();
              }}
              className="ui-btn ui-btn-subtle"
              type="button"
            >
              Открыть центр
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6">
      <div className="glass-icon glossy w-14 h-14 rounded-2xl flex items-center justify-center mb-3">
        <Bell className="w-6 h-6 text-ink-500" strokeWidth={2.1} />
      </div>
      <p className="text-sm font-semibold text-ink-700 font-body">Всё тихо</p>
      <p className="text-xs text-ink-400 font-body mt-1 text-center leading-relaxed">
        Новые уведомления появятся здесь
      </p>
    </div>
  );
}
