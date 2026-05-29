"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Minus, X } from "lucide-react";
import {
  deleteChannelOverride,
  deleteChatOverride,
  getChannelOverrides,
  getChatOverrides,
  getPermissionsCatalog,
  getRoles,
  setChannelOverride,
  setChatOverride,
  type FamilyRole,
  type PermissionOverride,
  type PermissionsCatalog,
} from "@/lib/api";

type Kind = "channel" | "chat";

type Props = {
  familyId: string;
  kind: Kind;
  items: { id: string; name: string }[];
  canManage: boolean;
};

type TriState = "inherit" | "allow" | "deny";

function bitState(allow: number, deny: number, bit: number): TriState {
  if ((deny & bit) !== 0) return "deny";
  if ((allow & bit) !== 0) return "allow";
  return "inherit";
}

export default function ChannelPermissionsEditor({
  familyId,
  kind,
  items,
  canManage,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (selectedId && items.find((i) => i.id === selectedId)) return;
    setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] p-7 text-sm text-ink-500">
        {kind === "channel"
          ? "В этой семье пока нет каналов."
          : "В этой семье пока нет чатов."}
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-full min-h-[420px]">
      {/* Список объектов */}
      <div className="w-[240px] shrink-0 flex flex-col border border-[color:var(--border-glass)] rounded-2xl bg-[color:var(--bg-surface-subtle)] overflow-hidden">
        <div className="px-3 py-2.5 border-b border-[color:var(--border-warm-dim)]">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-400 font-body">
            {kind === "channel" ? "Каналы" : "Чаты"}
          </span>
        </div>
        <ul className="flex-1 overflow-y-auto sidebar-scroll px-1.5 py-1.5 space-y-0.5">
          {items.map((it) => {
            const isActive = it.id === selectedId;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body transition ${
                    isActive
                      ? "bg-[color:var(--bg-elevated)] shadow-sm"
                      : "hover:bg-white/55"
                  }`}
                >
                  <span className="text-ink-400 mr-1">#</span>
                  <span className="text-ink-800">{it.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex-1 min-w-0">
        {selectedId ? (
          <OverridesPanel
            key={`${kind}-${selectedId}`}
            familyId={familyId}
            kind={kind}
            targetId={selectedId}
            targetName={items.find((i) => i.id === selectedId)?.name ?? ""}
            canManage={canManage}
          />
        ) : (
          <div className="text-sm text-ink-400 font-body">Выберите объект</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OverridesPanel({
  familyId,
  kind,
  targetId,
  targetName,
  canManage,
}: {
  familyId: string;
  kind: Kind;
  targetId: string;
  targetName: string;
  canManage: boolean;
}) {
  const [roles, setRoles] = useState<FamilyRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null);
  const [overrides, setOverrides] = useState<Map<string, { allow: number; deny: number }>>(
    new Map(),
  );
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, c, ov] = await Promise.all([
        getRoles(familyId),
        getPermissionsCatalog(familyId),
        kind === "channel"
          ? getChannelOverrides(familyId, targetId)
          : getChatOverrides(familyId, targetId),
      ]);
      setRoles(r);
      setCatalog(c);
      const map = new Map<string, { allow: number; deny: number }>();
      for (const o of ov) {
        map.set(o.role_id, { allow: o.allow, deny: o.deny });
      }
      setOverrides(map);
      // Стартуем на @everyone — это самый частый случай.
      const everyone = r.find((rr) => rr.is_everyone);
      setActiveRoleId(everyone?.id ?? r[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить overrides");
    } finally {
      setLoading(false);
    }
  }, [familyId, kind, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? null,
    [roles, activeRoleId],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-400 text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        Загрузка разрешений…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const ovForActive = active
    ? overrides.get(active.id) ?? { allow: 0, deny: 0 }
    : { allow: 0, deny: 0 };

  async function persist(roleId: string, allow: number, deny: number) {
    // Оптимистично обновляем локально, при ошибке откатываем.
    const prev = overrides.get(roleId);
    setOverrides((m) => {
      const next = new Map(m);
      if (allow === 0 && deny === 0) next.delete(roleId);
      else next.set(roleId, { allow, deny });
      return next;
    });
    try {
      if (allow === 0 && deny === 0) {
        if (kind === "channel") {
          await deleteChannelOverride(familyId, targetId, roleId);
        } else {
          await deleteChatOverride(familyId, targetId, roleId);
        }
      } else {
        if (kind === "channel") {
          await setChannelOverride(familyId, targetId, roleId, { allow, deny });
        } else {
          await setChatOverride(familyId, targetId, roleId, { allow, deny });
        }
      }
    } catch (e) {
      setOverrides((m) => {
        const next = new Map(m);
        if (prev) next.set(roleId, prev);
        else next.delete(roleId);
        return next;
      });
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setTimeout(() => setError(""), 3000);
    }
  }

  function setBit(bit: number, target: TriState) {
    if (!active) return;
    const { allow, deny } = ovForActive;
    let na = allow & ~bit;
    let nd = deny & ~bit;
    if (target === "allow") na |= bit;
    if (target === "deny") nd |= bit;
    void persist(active.id, na, nd);
  }

  function resetAll() {
    if (!active) return;
    void persist(active.id, 0, 0);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
          {kind === "channel" ? "Канал" : "Чат"}
        </p>
        <h3 className="font-display text-2xl text-ink-900 truncate">
          # {targetName}
        </h3>
        <p className="text-xs text-ink-500 font-body mt-1">
          Разрешения для роли применяются поверх её базовых прав в этом{" "}
          {kind === "channel" ? "канале" : "чате"}. <b>Запретить</b> сильнее, чем{" "}
          <b>разрешить</b>.
        </p>
      </header>

      <div className="flex gap-4 h-full min-h-0">
        {/* Колонка ролей */}
        <div className="w-[200px] shrink-0 border border-[color:var(--border-glass)] rounded-2xl bg-[color:var(--bg-surface-subtle)] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[color:var(--border-warm-dim)] text-[10px] uppercase tracking-widest font-semibold text-ink-400 font-body">
            Роли
          </div>
          <ul className="flex-1 overflow-y-auto sidebar-scroll px-1.5 py-1.5 space-y-0.5">
            {roles.map((r) => {
              const o = overrides.get(r.id);
              const hasOverride = o && (o.allow !== 0 || o.deny !== 0);
              const isActive = r.id === activeRoleId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setActiveRoleId(r.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body flex items-center gap-2 transition ${
                      isActive ? "bg-[color:var(--bg-elevated)] shadow-sm" : "hover:bg-white/55"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: r.color }}
                      aria-hidden
                    />
                    <span className="truncate flex-1">{r.name}</span>
                    {hasOverride && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-warm-400 shrink-0"
                        title="Есть переопределения"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Разрешения */}
        <div className="flex-1 min-w-0 overflow-y-auto sidebar-scroll pr-2 -mr-2 space-y-5">
          {active && (
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="min-w-0">
                <p className="font-display text-lg text-ink-900 inline-flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: active.color }}
                    aria-hidden
                  />
                  {active.name}
                </p>
                <p className="text-[11px] text-ink-400 font-body">
                  Три состояния: <b className="text-ink-500">наследовать</b> →{" "}
                  <b className="text-emerald-600">разрешить</b> →{" "}
                  <b className="text-red-600">запретить</b>
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle text-xs"
                  onClick={resetAll}
                  disabled={ovForActive.allow === 0 && ovForActive.deny === 0}
                  data-tooltip="Очистить все переопределения роли"
                >
                  Сбросить
                </button>
              )}
            </div>
          )}

          {catalog?.groups.map((group) => (
            <section key={group.name}>
              <h5 className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body mb-2">
                {group.name}
              </h5>
              <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] divide-y divide-[color:var(--border-warm-dim)]">
                {group.perms.map((p) => {
                  const s = bitState(ovForActive.allow, ovForActive.deny, p.bit);
                  return (
                    <div
                      key={p.bit}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-800 leading-tight">
                          {p.label}
                        </div>
                        <div className="text-xs text-ink-500 font-body mt-0.5 leading-snug">
                          {p.description}
                        </div>
                      </div>
                      <TriToggle
                        state={s}
                        disabled={!canManage}
                        onSet={(target) => setBit(p.bit, target)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function TriToggle({
  state,
  onSet,
  disabled,
}: {
  state: TriState;
  onSet: (target: TriState) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full bg-[color:var(--bg-elevated)] border border-[color:var(--border-glass-strong)] p-0.5 shrink-0 ${
        disabled ? "opacity-60" : ""
      }`}
      role="group"
    >
      <button
        type="button"
        disabled={disabled || state === "deny"}
        onClick={() => onSet("deny")}
        className={`w-7 h-7 rounded-full grid place-items-center transition ${
          state === "deny" ? "bg-red-500 text-white" : "text-ink-400 hover:text-red-600"
        }`}
        data-tooltip="Запретить"
        aria-label="Запретить"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2.6} />
      </button>
      <button
        type="button"
        disabled={disabled || state === "inherit"}
        onClick={() => onSet("inherit")}
        className={`w-7 h-7 rounded-full grid place-items-center transition ${
          state === "inherit" ? "bg-ink-300/60 text-ink-700" : "text-ink-400 hover:text-ink-700"
        }`}
        data-tooltip="Наследовать"
        aria-label="Наследовать"
      >
        <Minus className="w-3.5 h-3.5" strokeWidth={2.6} />
      </button>
      <button
        type="button"
        disabled={disabled || state === "allow"}
        onClick={() => onSet("allow")}
        className={`w-7 h-7 rounded-full grid place-items-center transition ${
          state === "allow" ? "bg-emerald-500 text-white" : "text-ink-400 hover:text-emerald-600"
        }`}
        data-tooltip="Разрешить"
        aria-label="Разрешить"
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
      </button>
    </div>
  );
}
