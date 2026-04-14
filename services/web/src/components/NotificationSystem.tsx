"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthToken, wsUrl } from "@/lib/api-base";

export type NotificationType =
  | "mention"
  | "member_joined"
  | "member_kicked"
  | "calendar_event"
  | "info";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  chat_id?: string;
  read?: boolean;
};

export type PresenceUpdateEvent = {
  type: "presence_update";
  family_id: string;
  user_id: string;
  is_online: boolean;
  last_seen_at: string | null;
};

let _id = 0;
function mkId() {
  _id += 1;
  return String(_id);
}

type WsPayload = Record<string, unknown>;

function safeJsonParse(raw: unknown): WsPayload | null {
  try {
    if (typeof raw !== "string") return null;
    const v = JSON.parse(raw);
    if (v && typeof v === "object") return v as WsPayload;
    return null;
  } catch {
    return null;
  }
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function arrStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string") as string[];
}

function formatStartsAt(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asPresenceUpdate(d: WsPayload): PresenceUpdateEvent | null {
  if (str(d.type) !== "presence_update") return null;

  const familyId = str(d.family_id);
  const userId = str(d.user_id);
  const isOnline = d.is_online;
  const rawLastSeen = d.last_seen_at;

  if (!familyId || !userId || typeof isOnline !== "boolean") return null;

  return {
    type: "presence_update",
    family_id: familyId,
    user_id: userId,
    is_online: isOnline,
    last_seen_at: typeof rawLastSeen === "string" ? rawLastSeen : null,
  };
}

function buildNotification(
  d: WsPayload,
  meUsername: string,
): Notification | null {
  const now = new Date().toISOString();
  const t = str(d.type);

  if (t === "mention") {
    const mentions = arrStrings(d.mentions);
    if (!mentions.includes(meUsername)) return null;

    return {
      id: mkId(),
      type: "mention",
      title: `${str(d.from, "Кто-то")} упомянул тебя`,
      body: str(d.text, ""),
      timestamp: now,
      chat_id: strOrUndef(d.chat_id),
      read: false,
    };
  }

  if (t === "member_joined") {
    const name = str(d.display_name, "Участник");
    return {
      id: mkId(),
      type: "member_joined",
      title: "Новый участник",
      body: `${name} вступил в семью`,
      timestamp: now,
      read: false,
    };
  }

  if (t === "member_kicked") {
    const name = str(d.display_name, "Участник");
    return {
      id: mkId(),
      type: "member_kicked",
      title: "Участник покинул семью",
      body: `${name} был исключён`,
      timestamp: now,
      read: false,
    };
  }

  if (t === "calendar_event" || t === "calendar_event_created") {
    const startsAtLabel = formatStartsAt(d.starts_at);
    return {
      id: mkId(),
      type: "calendar_event",
      title: "Новое событие",
      body: startsAtLabel
        ? `${str(d.title, "Событие добавлено в календарь")} · ${startsAtLabel}`
        : str(d.title, "Событие добавлено в календарь"),
      timestamp: now,
      read: false,
    };
  }

  if (t === "calendar_reminder") {
    const startsAtLabel = formatStartsAt(d.starts_at);
    const offsetLabel = str(d.offset_label);
    const parts = [
      str(d.title, "Событие"),
      startsAtLabel ? `Начало: ${startsAtLabel}` : "",
      offsetLabel,
    ].filter(Boolean);

    return {
      id: mkId(),
      type: "calendar_event",
      title: "Напоминание о событии",
      body: parts.join(" · "),
      timestamp: now,
      read: false,
    };
  }

  if (t === "ownership_transferred") {
    const name = str(d.new_owner_name, "участнику");
    return {
      id: mkId(),
      type: "info",
      title: "Изменение владельца",
      body: `Права владельца переданы ${name}`,
      timestamp: now,
      read: false,
    };
  }

  if (t === "info") {
    return {
      id: mkId(),
      type: "info",
      title: str(d.title, "Информация"),
      body: str(d.body, ""),
      timestamp: now,
      read: false,
    };
  }

  return null;
}

function cap<T>(arr: T[], limit: number): T[] {
  return arr.length > limit ? arr.slice(0, limit) : arr;
}

type UseNotificationsOptions = {
  onPresenceUpdate?: (event: PresenceUpdateEvent) => void;
};

export function useNotifications(
  familyId: string,
  meUsername: string,
  options?: UseNotificationsOptions,
) {
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [allNotifications, setAll] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const familyIdRef = useRef(familyId);
  const meRef = useRef(meUsername);
  const onPresenceUpdateRef = useRef<((event: PresenceUpdateEvent) => void) | undefined>(
    undefined,
  );

  useEffect(() => {
    familyIdRef.current = familyId;
    meRef.current = meUsername;
  }, [familyId, meUsername]);

  useEffect(() => {
    onPresenceUpdateRef.current = options?.onPresenceUpdate;
  }, [options?.onPresenceUpdate]);

  const toastTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearToastTimeout = (id: string) => {
    const m = toastTimeoutsRef.current;
    const t = m.get(id);
    if (t) clearTimeout(t);
    m.delete(id);
  };

  const scheduleToastAutoDismiss = (id: string, ms = 5000) => {
    clearToastTimeout(id);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      clearToastTimeout(id);
    }, ms);
    toastTimeoutsRef.current.set(id, t);
  };

  useEffect(() => {
    if (!familyId) return;

    let alive = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const stopPing = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = null;
    };

    const startPing = (ws: WebSocket) => {
      stopPing();
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 30000);
    };

    function connect() {
      if (!alive) return;

      const token = getAuthToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const ws = new WebSocket(wsUrl(`/families/${familyId}/ws${query}`));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        startPing(ws);
      };

      ws.onmessage = (e) => {
        if (!alive) return;

        const d = safeJsonParse(e.data);
        if (!d) return;

        const presenceUpdate = asPresenceUpdate(d);
        if (presenceUpdate) {
          onPresenceUpdateRef.current?.(presenceUpdate);
          return;
        }

        const notif = buildNotification(d, meRef.current);
        if (!notif) return;

        setAll((prev) => cap([notif, ...prev], 50));
        setUnread((prev) => prev + 1);
        setToasts((prev) => [...prev, notif]);
        scheduleToastAutoDismiss(notif.id, 5000);
      };

      ws.onclose = () => {
        stopPing();
        if (!alive) return;
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    }

    connect();

    return () => {
      alive = false;
      stopPing();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      for (const [, t] of toastTimeoutsRef.current) clearTimeout(t);
      toastTimeoutsRef.current.clear();

      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [familyId]);

  function dismiss(id: string) {
    clearToastTimeout(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setAll((prev) => prev.filter((n) => n.id !== id));
  }

  function clearUnread() {
    setUnread(0);
    setAll((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const hasAny = allNotifications.length > 0;

  const countsByType = useMemo(() => {
    const m: Record<NotificationType, number> = {
      mention: 0,
      member_joined: 0,
      member_kicked: 0,
      calendar_event: 0,
      info: 0,
    };

    for (const n of allNotifications) m[n.type] += 1;
    return m;
  }, [allNotifications]);

  function clearAll() {
    for (const n of allNotifications) clearToastTimeout(n.id);
    setToasts([]);
    setAll([]);
    setUnread(0);
  }

  return {
    toasts,
    allNotifications,
    unread,
    dismiss,
    clearUnread,
    hasAny,
    countsByType,
    clearAll,
  };
}
