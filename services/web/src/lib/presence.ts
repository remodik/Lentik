export type PresenceState = {
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLastSeen(iso?: string | null, now = new Date()): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return null;

  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes <= 1) return "Был(а) только что";
  if (diffMinutes < 60) return `Был(а) ${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 6) return `был(а) ${diffHours} ч назад`;

  if (isSameDay(date, now)) {
    return `Был(а) сегодня в ${formatTime(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Был(а) вчера в ${formatTime(date)}`;
  }

  return `Был(а) ${date.toLocaleDateString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} в ${formatTime(date)}`;
}

export function getPresenceLabel(
  presence: PresenceState,
  options?: {
    onlineLabel?: string;
    offlineLabel?: string;
    now?: Date;
  },
): string {
  if (presence.is_online) return options?.onlineLabel ?? "В сети";

  const lastSeenLabel = formatLastSeen(presence.last_seen_at, options?.now);
  if (lastSeenLabel) return lastSeenLabel;

  return options?.offlineLabel ?? "Не в сети";
}
