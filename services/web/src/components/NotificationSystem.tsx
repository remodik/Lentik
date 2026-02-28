"use client";

import { useEffect, useRef, useState } from "react";

export type Notification = {
  id: string;
  type: "mention" | "member_joined" | "member_kicked" | "info";
  title: string;
  body: string;
  chat_id?: string;
};

type Props = {
  familyId: string;
  meUsername: string;
  onNotification?: (n: Notification) => void;
};

let _toastId = 0;

export function useNotifications(familyId: string, meUsername: string) {
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!familyId) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.hostname}:8000/families/${familyId}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      let notif: Notification | null = null;

      if (d.type === "mention" && d.mentions?.includes(meUsername)) {
        notif = {
          id: String(++_toastId),
          type: "mention",
          title: `${d.from} упомянул тебя`,
          body: d.text,
          chat_id: d.chat_id,
        };
      } else if (d.type === "member_joined") {
        notif = {
          id: String(++_toastId),
          type: "member_joined",
          title: "Новый участник",
          body: `${d.display_name} вступил в семью`,
        };
      } else if (d.type === "member_kicked") {
        notif = {
          id: String(++_toastId),
          type: "member_kicked",
          title: "Участник исключён",
          body: `${d.display_name} покинул семью`,
        };
      }

      if (notif) {
        setToasts(p => [...p, notif!]);
        setUnread(p => p + 1);
        setTimeout(() => {
          setToasts(p => p.filter(t => t.id !== notif!.id));
        }, 5000);
      }
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 30000);

    return () => { clearInterval(ping); ws.close(); };
  }, [familyId, meUsername]);

  function dismiss(id: string) {
    setToasts(p => p.filter(t => t.id !== id));
  }

  function clearUnread() {
    setUnread(0);
  }

  return { toasts, unread, dismiss, clearUnread };
}


const ICONS: Record<Notification["type"], string> = {
  mention: "💬",
  member_joined: "👋",
  member_kicked: "🚪",
  info: "ℹ️",
};

export function ToastContainer({
  toasts,
  onDismiss,
  onChatOpen,
}: {
  toasts: Notification[];
  onDismiss: (id: string) => void;
  onChatOpen?: (chatId: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-white border border-cream-200 rounded-2xl shadow-xl p-4 flex items-start gap-3
                     animate-fade-up"
          onClick={() => t.chat_id && onChatOpen?.(t.chat_id)}
          style={{ cursor: t.chat_id ? "pointer" : "default" }}
        >
          <span className="text-xl shrink-0">{ICONS[t.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-900 font-body">{t.title}</p>
            <p className="text-xs text-ink-500 font-body mt-0.5 line-clamp-2">{t.body}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(t.id); }}
            className="shrink-0 text-ink-300 hover:text-ink-700 transition-colors text-lg leading-none p-0.5"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}