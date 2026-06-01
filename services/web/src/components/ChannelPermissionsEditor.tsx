"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Loader2, Minus, X } from "lucide-react";
import {
  deleteChannelOverride,
  deleteChannelMemberOverride,
  deleteChatOverride,
  deleteChatMemberOverride,
  getChannelOverrides,
  getChatOverrides,
  getPermissionsCatalog,
  getRoles,
  setChannelOverride,
  setChannelMemberOverride,
  setChatOverride,
  setChatMemberOverride,
  type FamilyRole,
  type FamilyMember,
  type PermissionOverride,
  type PermissionsCatalog,
} from "@/lib/api";

type Kind = "channel" | "chat";

type Props = {
  familyId: string;
  kind: Kind;
  items: { id: string; name: string }[];
  members: FamilyMember[];
  canManage: boolean;
};

type TriState = "inherit" | "allow" | "deny";
type SubjectType = "role" | "member";

type SubjectRef = {
  type: SubjectType;
  id: string;
};

function subjectKey(subject: SubjectRef) {
  return `${subject.type}:${subject.id}`;
}

function overrideKey(override: PermissionOverride) {
  if (override.subject_type === "member" && override.user_id) {
    return subjectKey({ type: "member", id: override.user_id });
  }
  if (override.role_id) {
    return subjectKey({ type: "role", id: override.role_id });
  }
  return null;
}

function bitState(allow: number, deny: number, bit: number): TriState {
  if ((deny & bit) !== 0) return "deny";
  if ((allow & bit) !== 0) return "allow";
  return "inherit";
}

export default function ChannelPermissionsEditor({
  familyId,
  kind,
  items,
  members,
  canManage,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  // На мобильном (<md): список объектов либо панель override'ов выбранного.
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

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
      <div
        className={`w-full md:w-[240px] md:shrink-0 md:flex flex-col border border-[color:var(--border-glass)] rounded-2xl bg-[color:var(--bg-surface-subtle)] overflow-hidden ${
          mobileView === "list" ? "flex" : "hidden"
        }`}
      >
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
                  onClick={() => {
                    setSelectedId(it.id);
                    setMobileView("detail");
                  }}
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

      <div
        className={`flex-1 min-w-0 md:block ${
          mobileView === "detail" ? "block" : "hidden"
        }`}
      >
        {/* Назад к списку — только мобильный */}
        <button
          type="button"
          onClick={() => setMobileView("list")}
          className="md:hidden inline-flex items-center gap-1.5 text-sm text-ink-600 font-body mb-3"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.2} />
          {kind === "channel" ? "К списку каналов" : "К списку чатов"}
        </button>
        {selectedId ? (
          <OverridesPanel
            key={`${kind}-${selectedId}`}
            familyId={familyId}
            kind={kind}
            targetId={selectedId}
            targetName={items.find((i) => i.id === selectedId)?.name ?? ""}
            members={members}
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
  members,
  canManage,
}: {
  familyId: string;
  kind: Kind;
  targetId: string;
  targetName: string;
  members: FamilyMember[];
  canManage: boolean;
}) {
  const [roles, setRoles] = useState<FamilyRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null);
  const [overrides, setOverrides] = useState<Map<string, { allow: number; deny: number }>>(
    new Map(),
  );
  const [activeSubject, setActiveSubject] = useState<SubjectRef | null>(null);
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
        const key = overrideKey(o);
        if (key) map.set(key, { allow: o.allow, deny: o.deny });
      }
      setOverrides(map);
      // Стартуем на @everyone — это самый частый случай.
      const everyone = r.find((rr) => rr.is_everyone);
      setActiveSubject((prev) => {
        if (prev?.type === "role" && r.some((role) => role.id === prev.id)) return prev;
        if (prev?.type === "member" && members.some((member) => member.user_id === prev.id)) {
          return prev;
        }
        return everyone?.id ? { type: "role", id: everyone.id } : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить overrides");
    } finally {
      setLoading(false);
    }
  }, [familyId, kind, members, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRole = useMemo(
    () =>
      activeSubject?.type === "role"
        ? roles.find((role) => role.id === activeSubject.id) ?? null
        : null,
    [roles, activeSubject],
  );
  const activeMember = useMemo(
    () =>
      activeSubject?.type === "member"
        ? members.find((member) => member.user_id === activeSubject.id) ?? null
        : null,
    [members, activeSubject],
  );
  const activeName = activeRole?.name ?? activeMember?.display_name ?? "";
  const activeColor = activeRole?.color ?? "#64748b";
  const activeOverrideKey = activeSubject ? subjectKey(activeSubject) : null;

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

  const ovForActive = activeOverrideKey
    ? overrides.get(activeOverrideKey) ?? { allow: 0, deny: 0 }
    : { allow: 0, deny: 0 };

  async function persist(subject: SubjectRef, allow: number, deny: number) {
    const key = subjectKey(subject);
    // Оптимистично обновляем локально, при ошибке откатываем.
    const prev = overrides.get(key);
    setOverrides((m) => {
      const next = new Map(m);
      if (allow === 0 && deny === 0) next.delete(key);
      else next.set(key, { allow, deny });
      return next;
    });
    try {
      if (allow === 0 && deny === 0) {
        if (kind === "channel" && subject.type === "role") {
          await deleteChannelOverride(familyId, targetId, subject.id);
        } else if (kind === "channel") {
          await deleteChannelMemberOverride(familyId, targetId, subject.id);
        } else if (subject.type === "role") {
          await deleteChatOverride(familyId, targetId, subject.id);
        } else {
          await deleteChatMemberOverride(familyId, targetId, subject.id);
        }
      } else {
        if (kind === "channel" && subject.type === "role") {
          await setChannelOverride(familyId, targetId, subject.id, { allow, deny });
        } else if (kind === "channel") {
          await setChannelMemberOverride(familyId, targetId, subject.id, { allow, deny });
        } else if (subject.type === "role") {
          await setChatOverride(familyId, targetId, subject.id, { allow, deny });
        } else {
          await setChatMemberOverride(familyId, targetId, subject.id, { allow, deny });
        }
      }
    } catch (e) {
      setOverrides((m) => {
        const next = new Map(m);
        if (prev) next.set(key, prev);
        else next.delete(key);
        return next;
      });
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setTimeout(() => setError(""), 3000);
    }
  }

  function setBit(bit: number, target: TriState) {
    if (!activeSubject) return;
    const { allow, deny } = ovForActive;
    let na = allow & ~bit;
    let nd = deny & ~bit;
    if (target === "allow") na |= bit;
    if (target === "deny") nd |= bit;
    void persist(activeSubject, na, nd);
  }

  function resetAll() {
    if (!activeSubject) return;
    void persist(activeSubject, 0, 0);
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
          Разрешения роли или участника применяются поверх базовых прав в этом{" "}
          {kind === "channel" ? "канале" : "чате"}.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-3 md:gap-4 h-full min-h-0">
        {/* Колонка субъектов: горизонтальные чипы на мобильном, колонка на ≥md */}
        <div className="md:w-[200px] md:shrink-0 border border-[color:var(--border-glass)] rounded-2xl bg-[color:var(--bg-surface-subtle)] flex flex-col overflow-hidden">
          <div className="hidden md:block px-3 py-2 border-b border-[color:var(--border-warm-dim)] text-[10px] uppercase tracking-widest font-semibold text-ink-400 font-body">
            Субъект
          </div>
          <ul className="flex md:flex-col gap-1 md:gap-0.5 overflow-x-auto md:overflow-y-auto sidebar-scroll no-scrollbar px-1.5 py-1.5 md:space-y-0.5 flex-1">
            <li className="shrink-0 md:shrink px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-widest font-semibold text-ink-400 font-body self-center md:self-auto">
              Роли
            </li>
            {roles.map((r) => {
              const key = subjectKey({ type: "role", id: r.id });
              const o = overrides.get(key);
              const hasOverride = o && (o.allow !== 0 || o.deny !== 0);
              const isActive = activeSubject?.type === "role" && r.id === activeSubject.id;
              return (
                <li key={r.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => setActiveSubject({ type: "role", id: r.id })}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body flex items-center gap-2 transition border md:border-0 ${
                      isActive
                        ? "bg-[color:var(--bg-elevated)] shadow-sm border-[color:var(--border-glass-strong)] md:border-0"
                        : "hover:bg-white/55 border-[color:var(--border-glass)] md:border-0"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: r.color }}
                      aria-hidden
                    />
                    <span className="truncate whitespace-nowrap md:flex-1">{r.name}</span>
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
            <li className="shrink-0 md:shrink px-2 pt-1 md:pt-2 pb-0.5 text-[10px] uppercase tracking-widest font-semibold text-ink-400 font-body self-center md:self-auto">
              Участники
            </li>
            {members.map((member) => {
              const key = subjectKey({ type: "member", id: member.user_id });
              const o = overrides.get(key);
              const hasOverride = o && (o.allow !== 0 || o.deny !== 0);
              const isActive =
                activeSubject?.type === "member" && member.user_id === activeSubject.id;
              return (
                <li key={member.user_id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSubject({ type: "member", id: member.user_id })
                    }
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body flex items-center gap-2 transition border md:border-0 ${
                      isActive
                        ? "bg-[color:var(--bg-elevated)] shadow-sm border-[color:var(--border-glass-strong)] md:border-0"
                        : "hover:bg-white/55 border-[color:var(--border-glass)] md:border-0"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full shrink-0 bg-ink-200 text-[10px] text-ink-700 grid place-items-center font-semibold">
                      {member.display_name.trim().slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate whitespace-nowrap md:flex-1">
                      {member.display_name}
                    </span>
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
        <div className="flex-1 min-w-0 overflow-y-auto sidebar-scroll md:pr-2 md:-mr-2 space-y-5">
          {activeSubject && (
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="min-w-0">
                <p className="font-display text-lg text-ink-900 inline-flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: activeColor }}
                    aria-hidden
                  />
                  {activeName}
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
                  data-tooltip="Очистить все переопределения"
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
