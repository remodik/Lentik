"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Crown,
  History,
  Link2,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { getAuditLog, type AuditLogEntry } from "@/lib/api";

type Props = {
  familyId: string;
};

type ActionMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: "default" | "danger" | "warm";
};

const ACTION_META: Record<string, ActionMeta> = {
  "family.renamed": { label: "Семья переименована", icon: Pencil },
  "family.member_joined": { label: "Участник присоединился", icon: UserPlus },
  "family.member_kicked": { label: "Участник исключён", icon: UserMinus, tone: "danger" },
  "family.ownership_transferred": { label: "Передача прав владельца", icon: Crown, tone: "warm" },
  "family.invite_created": { label: "Создано приглашение", icon: Link2 },

  "chat.created": { label: "Создан чат", icon: Plus },
  "chat.deleted": { label: "Удалён чат", icon: Trash2, tone: "danger" },
  "chat.updated": { label: "Изменены настройки чата", icon: Settings },
  "chat.pinned": { label: "Закреплено сообщение", icon: Pin, tone: "warm" },
  "chat.unpinned": { label: "Откреплено сообщение", icon: PinOff },
  "channel.created": { label: "Создан канал", icon: Plus },
  "channel.deleted": { label: "Удалён канал", icon: Trash2, tone: "danger" },
  "channel.updated": { label: "Изменены настройки канала", icon: Settings },

  "message.deleted_by_moderator": {
    label: "Модератор удалил сообщение",
    icon: Trash2,
    tone: "danger",
  },
  "message.edited_by_moderator": {
    label: "Модератор отредактировал сообщение",
    icon: Pencil,
    tone: "warm",
  },

  "role.created": { label: "Создана роль", icon: Shield },
  "role.updated": { label: "Изменена роль", icon: Shield },
  "role.deleted": { label: "Удалена роль", icon: Shield, tone: "danger" },
  "role.assigned": { label: "Назначены роли", icon: Shield },

  "override.changed": { label: "Изменены разрешения", icon: AlertTriangle, tone: "warm" },
  "override.removed": { label: "Сброшены разрешения", icon: AlertTriangle },
};

const FALLBACK_META: ActionMeta = { label: "Событие", icon: History };

type CategoryId = "all" | "family" | "chat" | "channel" | "message" | "role" | "override";

const CATEGORIES: { id: CategoryId; label: string; prefix: string }[] = [
  { id: "all", label: "Все", prefix: "" },
  { id: "family", label: "Семья", prefix: "family." },
  { id: "chat", label: "Чаты", prefix: "chat." },
  { id: "channel", label: "Каналы", prefix: "channel." },
  { id: "message", label: "Сообщения", prefix: "message." },
  { id: "role", label: "Роли", prefix: "role." },
  { id: "override", label: "Разрешения", prefix: "override." },
];

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return d.toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FIELD_LABELS: Record<string, string> = {
  name: "Название",
  description: "Описание",
  slow_mode_seconds: "Медленный режим",
  is_18plus: "18+",
  color: "Цвет",
  priority: "Приоритет",
};

function formatVal(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "включено" : "выключено";
  if (field === "slow_mode_seconds" && typeof val === "number") {
    return val === 0 ? "выключен" : `${val} с`;
  }
  return String(val);
}

function describeAction(entry: AuditLogEntry): React.ReactNode {
  const meta = entry.metadata ?? {};
  const s = (k: string) => String(meta[k] ?? "");
  switch (entry.action) {
    case "family.renamed":
      return (
        <>
          переименовал семью «{s("from")}» → <b>{s("to")}</b>
        </>
      );
    case "family.member_joined":
      return <>присоединился к семье</>;
    case "family.member_kicked":
      return (
        <>
          исключил <b>{String(meta.display_name ?? "участника")}</b>
        </>
      );
    case "family.ownership_transferred":
      return (
        <>
          передал права владельца{" "}
          <b>{String(meta.new_owner_name ?? "")}</b>
        </>
      );
    case "family.invite_created":
      return (
        <>
          создал приглашение
          {meta.max_uses ? ` (до ${s("max_uses")} использ.)` : ""}
        </>
      );

    case "chat.created":
      return (
        <>
          создал чат <b># {s("name")}</b>
        </>
      );
    case "chat.deleted":
      return (
        <>
          удалил чат <b># {s("name")}</b>
        </>
      );
    case "chat.updated":
      return (
        <>
          изменил чат <b># {s("name")}</b>
        </>
      );
    case "chat.pinned":
      return <>закрепил сообщение</>;
    case "chat.unpinned":
      return <>открепил сообщение</>;

    case "channel.created":
      return (
        <>
          создал канал <b># {s("name")}</b>
        </>
      );
    case "channel.deleted":
      return (
        <>
          удалил канал <b># {s("name")}</b>
        </>
      );
    case "channel.updated":
      return (
        <>
          изменил канал <b># {s("name")}</b>
        </>
      );

    case "message.deleted_by_moderator":
      return (
        <>
          удалил сообщение{" "}
          {meta.author_name ? <>от <b>{s("author_name")}</b></> : "участника"}
          {meta.chat_name ? <> в # {s("chat_name")}</> : null}
        </>
      );
    case "message.edited_by_moderator":
      return (
        <>
          отредактировал сообщение{" "}
          {meta.author_name ? <>от <b>{s("author_name")}</b></> : "участника"}
        </>
      );

    case "role.created":
      return (
        <>
          создал роль <b>{s("name")}</b>
        </>
      );
    case "role.updated":
      return (
        <>
          изменил роль <b>{s("name")}</b>
        </>
      );
    case "role.deleted":
      return (
        <>
          удалил роль <b>{s("name")}</b>
        </>
      );
    case "role.assigned": {
      const target = meta.member_name ? <b>{s("member_name")}</b> : "участнику";
      return <>изменил роли {target}</>;
    }

    case "override.changed":
      return (
        <>
          изменил права роли <b>{s("role_name")}</b>
          {meta.target_name ? <> в # {s("target_name")}</> : null}
        </>
      );
    case "override.removed":
      return (
        <>
          сбросил права роли <b>{s("role_name")}</b>
          {meta.target_name ? <> в # {s("target_name")}</> : null}
        </>
      );

    default:
      return entry.action;
  }
}

function PermChips({ added, removed }: { added?: string[]; removed?: string[] }) {
  if ((!added || added.length === 0) && (!removed || removed.length === 0)) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {(added ?? []).map((p) => (
        <span
          key={`a-${p}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          + {p}
        </span>
      ))}
      {(removed ?? []).map((p) => (
        <span
          key={`r-${p}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-red-50 text-red-600 border border-red-200"
        >
          − {p}
        </span>
      ))}
    </div>
  );
}

/** Опциональный блок деталей под однострочным описанием. */
function renderDetails(entry: AuditLogEntry): React.ReactNode {
  const meta = entry.metadata ?? {};

  // before→after изменения полей (чат/канал/роль)
  const changes = meta.changes as
    | Record<string, { from: unknown; to: unknown }>
    | undefined;

  const permDiff = meta.permissions as
    | { added?: string[]; removed?: string[] }
    | undefined;

  const parts: React.ReactNode[] = [];

  if (changes && typeof changes === "object") {
    for (const [field, ch] of Object.entries(changes)) {
      parts.push(
        <div key={field} className="text-[12px] text-ink-500 font-body">
          <span className="text-ink-400">{FIELD_LABELS[field] ?? field}:</span>{" "}
          <span className="line-through opacity-70">{formatVal(field, ch.from)}</span>
          {" → "}
          <span className="text-ink-700 font-medium">{formatVal(field, ch.to)}</span>
        </div>,
      );
    }
  }

  // дифф ролей участника
  if (entry.action === "role.assigned") {
    const added = (meta.added as string[]) ?? [];
    const removed = (meta.removed as string[]) ?? [];
    if (added.length || removed.length) {
      parts.push(<PermChips key="roles" added={added} removed={removed} />);
    } else if (Array.isArray(meta.role_names)) {
      parts.push(
        <div key="rn" className="text-[12px] text-ink-500 font-body">
          итог: {(meta.role_names as string[]).join(", ") || "только @everyone"}
        </div>,
      );
    }
  }

  // дифф прав роли
  if (permDiff && (permDiff.added?.length || permDiff.removed?.length)) {
    parts.push(
      <PermChips key="perms" added={permDiff.added} removed={permDiff.removed} />,
    );
  }

  // override allow/deny
  if (entry.action === "override.changed") {
    const allowed = (meta.allowed as string[]) ?? [];
    const denied = (meta.denied as string[]) ?? [];
    if (allowed.length || denied.length) {
      parts.push(<PermChips key="ov" added={allowed} removed={denied} />);
    }
  }

  // удалённое сообщение — текст
  if (entry.action === "message.deleted_by_moderator" && meta.text) {
    parts.push(
      <div
        key="msg"
        className="text-[12px] text-ink-500 font-body mt-1 px-2 py-1 rounded-md bg-[color:var(--bg-surface-subtle)] border border-[color:var(--border-glass)] italic line-clamp-2"
      >
        «{String(meta.text)}»
      </div>,
    );
  }

  if (parts.length === 0) return null;
  return <div className="mt-1 space-y-0.5">{parts}</div>;
}

export default function AuditLogView({ familyId }: Props) {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (cursor?: string) => {
      const before = cursor;
      if (before) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await getAuditLog(familyId, { limit: 50, before });
        if (before) {
          setItems((prev) => [...prev, ...data]);
        } else {
          setItems(data);
        }
        setHasMore(data.length === 50);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить журнал");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [familyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const prefix = CATEGORIES.find((c) => c.id === category)?.prefix ?? "";
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (prefix && !it.action.startsWith(prefix)) return false;
      if (q) {
        const name = (it.actor_display_name ?? "").toLowerCase();
        const uname = (it.actor_username ?? "").toLowerCase();
        if (!name.includes(q) && !uname.includes(q)) return false;
      }
      return true;
    });
  }, [items, category, query]);

  const grouped = useMemo(() => {
    const map: { date: string; items: AuditLogEntry[] }[] = [];
    let prevKey = "";
    for (const it of filtered) {
      const d = new Date(it.created_at);
      const key = d.toDateString();
      if (key !== prevKey) {
        prevKey = key;
        map.push({
          date: d.toLocaleDateString("ru", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          items: [],
        });
      }
      map[map.length - 1].items.push(it);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-400 text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        Загрузка журнала…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-ink-500 font-body">
          Записываются ключевые действия: переименования, удаления, изменения ролей и разрешений.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5 shrink-0"
          disabled={loading}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.2} />
          Обновить
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-2.5 py-1 rounded-full text-[12px] font-body transition border ${
                category === c.id
                  ? "bg-ink-900 text-[color:var(--text-on-dark)] border-ink-900"
                  : "bg-[color:var(--bg-surface-subtle)] text-ink-600 border-[color:var(--border-glass)] hover:border-[color:var(--border-glass-strong)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto min-w-[180px] flex-1 sm:flex-initial">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400"
            strokeWidth={2.2}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по автору…"
            className="w-full rounded-lg border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] pl-8 pr-7 py-1.5 text-[13px] text-ink-800 outline-none focus:border-[color:var(--border-glass-strong)] font-body"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center text-ink-400 hover:text-ink-700"
              aria-label="Очистить"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.3} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-7 text-center text-sm text-ink-500">
          Журнал пока пуст. Здесь будут появляться действия модераторов и владельца.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-7 text-center text-sm text-ink-500">
          Ничего не найдено по выбранному фильтру.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto sidebar-scroll pr-1 -mr-1">
          {grouped.map((group) => (
            <section key={group.date} className="mb-5">
              <div className="py-2">
                <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-ink-400 font-body">
                  {group.date}
                </span>
              </div>
              <ul className="space-y-1 pt-1">
                {group.items.map((it) => {
                  const meta = ACTION_META[it.action] ?? FALLBACK_META;
                  const Icon = meta.icon;
                  const toneClass =
                    meta.tone === "danger"
                      ? "bg-red-50 text-red-600 border-red-200"
                      : meta.tone === "warm"
                        ? "bg-warm-50 text-warm-700 border-warm-200"
                        : "bg-[color:var(--bg-surface-subtle)] text-ink-600 border-[color:var(--border-glass)]";
                  return (
                    <li
                      key={it.id}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)]"
                    >
                      <span
                        className={`w-7 h-7 rounded-lg grid place-items-center border shrink-0 ${toneClass}`}
                        aria-hidden
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink-800 leading-snug">
                          <span className="font-semibold">
                            {it.actor_display_name ?? "Участник"}
                          </span>{" "}
                          {describeAction(it)}
                        </div>
                        {renderDetails(it)}
                        <div className="text-[11px] text-ink-400 font-body mt-0.5">
                          {formatWhen(it.created_at)}
                          {it.actor_username && ` · @${it.actor_username}`}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-1 pb-4">
              <button
                type="button"
                className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                disabled={loadingMore}
                onClick={() =>
                  void load(items[items.length - 1]?.created_at)
                }
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />
                    Загрузка…
                  </>
                ) : (
                  <>Показать ещё</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
