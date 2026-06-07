"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  createRole,
  deleteRole,
  getPermissionsCatalog,
  getRoles,
  reorderRoles,
  updateRole,
  type FamilyRole,
  type PermissionsCatalog,
} from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { hasBit, PERM, usePermissions } from "@/lib/usePermissions";
import CopyIdButton from "@/components/CopyIdButton";

type Props = {
  familyId: string;
  isOwner: boolean;
};

function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function isFixedRole(role: FamilyRole) {
  return role.slug === "owner" || role.is_everyone;
}

function sortRolesForDisplay(roles: FamilyRole[]) {
  return [...roles].sort((a, b) => {
    const rank = (role: FamilyRole) => {
      if (role.slug === "owner") return 0;
      if (role.is_everyone) return 2;
      return 1;
    };
    const rankDelta = rank(a) - rank(b);
    if (rankDelta !== 0) return rankDelta;
    const priorityDelta = a.priority - b.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return a.name.localeCompare(b.name, "ru");
  });
}

function normalizeRoleOrder(roles: FamilyRole[]) {
  const owner = roles.find((role) => role.slug === "owner");
  const everyone = roles.find((role) => role.is_everyone);
  const middle = roles.filter(
    (role) => role.id !== owner?.id && role.id !== everyone?.id,
  );
  return [
    ...(owner ? [owner] : []),
    ...middle,
    ...(everyone ? [everyone] : []),
  ];
}

function mergeFixedRoles(currentRoles: FamilyRole[], movableRoles: FamilyRole[]) {
  const owner = currentRoles.find((role) => role.slug === "owner");
  const everyone = currentRoles.find((role) => role.is_everyone);
  const nextMovable = movableRoles.map((role, index) => ({
    ...role,
    priority: (index + 1) * 10,
  }));
  return normalizeRoleOrder([
    ...(owner ? [{ ...owner, priority: 0 }] : []),
    ...nextMovable,
    ...(everyone
      ? [{ ...everyone, priority: Math.max(100, (nextMovable.length + 1) * 10) }]
      : []),
  ]);
}

function DropLine({ active }: { active: boolean }) {
  return (
    <li
      aria-hidden
      className={classNames(
        "mx-1 h-1 rounded-full transition",
        active ? "bg-warm-500 opacity-100" : "bg-transparent opacity-0",
      )}
    />
  );
}

export default function RolesEditor({ familyId, isOwner }: Props) {
  const { confirm, notify } = useConfirm();
  const { perms } = usePermissions();
  const [roles, setRoles] = useState<FamilyRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  // На мобильном (<md) показываем либо список, либо редактор выбранной роли.
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const canManageRoles =
    isOwner || perms?.is_owner || hasBit(perms?.base ?? 0, PERM.MANAGE_ROLES);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, c] = await Promise.all([
        getRoles(familyId),
        getPermissionsCatalog(familyId),
      ]);
      const sortedRoles = sortRolesForDisplay(r);
      setRoles(sortedRoles);
      setCatalog(c);
      setSelectedId((prev) => prev ?? sortedRoles[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить роли");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );
  const displayRoles = useMemo(() => normalizeRoleOrder(roles), [roles]);
  const movableRoles = useMemo(
    () => displayRoles.filter((role) => !isFixedRole(role)),
    [displayRoles],
  );
  const ownerRole = displayRoles.find((role) => role.slug === "owner");
  const everyoneRole = displayRoles.find((role) => role.is_everyone);

  async function handleCreate() {
    if (creating || !canManageRoles) return;
    setCreating(true);
    try {
      const next = await createRole(familyId, {
        name: "Новая роль",
        color: "#a1a1aa",
        permissions: 0,
      });
      setRoles((prev) => sortRolesForDisplay([...prev, next]));
      setSelectedId(next.id);
    } catch (e) {
      void notify({
        title: e instanceof Error ? e.message : "Не удалось создать роль",
        tone: "danger",
      });
    } finally {
      setCreating(false);
    }
  }

  function updateLocal(next: FamilyRole) {
    setRoles((prev) =>
      normalizeRoleOrder(prev.map((r) => (r.id === next.id ? next : r))),
    );
  }

  function handleDragStart(e: React.DragEvent, role: FamilyRole) {
    if (!canManageRoles || isFixedRole(role) || reordering) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", role.id);
    setDraggingId(role.id);
    setDropIndex(movableRoles.findIndex((item) => item.id === role.id));
  }

  function handleDragOverRole(e: React.DragEvent, index: number) {
    if (!canManageRoles || !draggingId || reordering) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const nextIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    setDropIndex(nextIndex);
  }

  function handleDragOverFixed(e: React.DragEvent, index: number) {
    if (!canManageRoles || !draggingId || reordering) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropIndex(null);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canManageRoles || !draggingId || dropIndex === null || reordering) {
      handleDragEnd();
      return;
    }

    const fromIndex = movableRoles.findIndex((role) => role.id === draggingId);
    if (fromIndex < 0) {
      handleDragEnd();
      return;
    }

    const nextMovable = [...movableRoles];
    const [moved] = nextMovable.splice(fromIndex, 1);
    const targetIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
    nextMovable.splice(targetIndex, 0, moved);
    handleDragEnd();

    if (targetIndex === fromIndex) return;

    const previousRoles = roles;
    setRoles(mergeFixedRoles(displayRoles, nextMovable));
    setReordering(true);
    try {
      const updated = await reorderRoles(
        familyId,
        nextMovable.map((role) => role.id),
      );
      setRoles(sortRolesForDisplay(updated));
    } catch (err) {
      setRoles(previousRoles);
      void notify({
        title: err instanceof Error ? err.message : "Не удалось сохранить порядок ролей",
        tone: "danger",
      });
    } finally {
      setReordering(false);
    }
  }

  function renderRoleItem(
    role: FamilyRole,
    options: { index?: number; fixedDropIndex?: number },
  ) {
    const isActive = role.id === selectedId;
    const draggable = canManageRoles && !isFixedRole(role) && !reordering;
    return (
      <li
        key={role.id}
        draggable={draggable}
        onDragStart={(e) => handleDragStart(e, role)}
        onDragOver={(e) => {
          if (options.fixedDropIndex !== undefined) {
            handleDragOverFixed(e, options.fixedDropIndex);
            return;
          }
          if (options.index !== undefined) handleDragOverRole(e, options.index);
        }}
        onDragEnd={handleDragEnd}
        className={classNames("relative group/role", draggingId === role.id && "opacity-45")}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedId(role.id);
            setMobileView("detail");
          }}
          className={classNames(
            "w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body flex items-center gap-2 transition",
            isActive
              ? "bg-[color:var(--bg-elevated)] shadow-sm"
              : "hover:bg-white/55",
          )}
        >
          {draggable && (
            <GripVertical
              className="w-3.5 h-3.5 text-ink-300 shrink-0 cursor-grab"
              strokeWidth={2.2}
              aria-hidden
            />
          )}
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: role.color }}
            aria-hidden
          />
          <span className="truncate flex-1">{role.name}</span>
          {role.slug === "owner" && (
            <Crown className="w-3 h-3 text-warm-500 shrink-0" strokeWidth={2.4} />
          )}
          {role.member_count > 0 && (
            <span className="text-[10px] text-ink-400 font-body shrink-0">
              {role.member_count}
            </span>
          )}
        </button>
        {/* Кнопка копирования UUID (только expert) — поверх строки, не вложена в button. */}
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <CopyIdButton value={role.id} label={`роль ${role.name}`} />
        </span>
      </li>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-ink-400 text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        Загрузка ролей…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[color:var(--danger-border-faint)] bg-[var(--danger-bg-soft)] px-4 py-3 text-sm text-[color:var(--danger-fg-bold)]">
        {error}
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-full min-h-[420px] md:min-h-[420px]">
      {/* Список ролей */}
      <div
        className={classNames(
          "flex-col border border-[color:var(--border-glass)] rounded-2xl bg-[color:var(--bg-surface-subtle)]",
          "w-full md:w-[240px] md:shrink-0 md:flex",
          mobileView === "list" ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--border-warm-dim)]">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-400 font-body">
            Роли
          </span>
          <div className="flex items-center gap-1">
            {reordering && (
              <Loader2
                className="w-3.5 h-3.5 text-ink-400 animate-spin"
                strokeWidth={2.2}
                aria-label="Сохраняем порядок"
              />
            )}
            {canManageRoles && (
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="tooltip-down w-6 h-6 rounded-md grid place-items-center text-ink-500 hover:text-ink-900 hover:bg-white/70 transition"
                data-tooltip="Создать роль"
                aria-label="Создать роль"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
        <ul
          className="flex-1 overflow-y-auto sidebar-scroll px-1.5 py-1.5 space-y-0.5 rounded-b-2xl"
          onDrop={(e) => void handleDrop(e)}
          onDragOver={(e) => {
            if (canManageRoles && draggingId && movableRoles.length === 0) {
              e.preventDefault();
              setDropIndex(0);
            }
          }}
        >
          {ownerRole && renderRoleItem(ownerRole, { fixedDropIndex: 0 })}
          <DropLine active={dropIndex === 0 && Boolean(draggingId)} />
          {movableRoles.map((role, index) => (
            <React.Fragment key={role.id}>
              {renderRoleItem(role, { index })}
              <DropLine active={dropIndex === index + 1 && Boolean(draggingId)} />
            </React.Fragment>
          ))}
          {everyoneRole &&
            renderRoleItem(everyoneRole, { fixedDropIndex: movableRoles.length })}
        </ul>
      </div>

      {/* Редактор */}
      <div
        className={classNames(
          "flex-1 min-w-0 md:flex md:flex-col",
          mobileView === "detail" ? "flex flex-col" : "hidden",
        )}
      >
        {/* Кнопка «назад» к списку — только на мобильном */}
        <button
          type="button"
          onClick={() => setMobileView("list")}
          className="md:hidden inline-flex items-center gap-1.5 text-sm text-ink-600 font-body mb-3 self-start"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.2} />
          К списку ролей
        </button>
        {selected ? (
          <RoleDetail
            key={selected.id}
            familyId={familyId}
            role={selected}
            catalog={catalog}
            canManage={canManageRoles}
            onChange={updateLocal}
            onDeleted={(deletedId) => {
              setRoles((prev) => prev.filter((r) => r.id !== deletedId));
              setSelectedId((prev) =>
                prev === deletedId ? roles[0]?.id ?? null : prev,
              );
              setMobileView("list");
            }}
            onError={(msg) => void notify({ title: msg, tone: "danger" })}
            confirm={confirm}
          />
        ) : (
          <div className="text-sm text-ink-400 font-body">Выберите роль слева</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RoleDetail({
  familyId,
  role,
  catalog,
  canManage,
  onChange,
  onDeleted,
  onError,
  confirm,
}: {
  familyId: string;
  role: FamilyRole;
  catalog: PermissionsCatalog | null;
  canManage: boolean;
  onChange: (next: FamilyRole) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
  confirm: (opts: {
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [permissions, setPermissions] = useState<number>(role.permissions);
  const [savingField, setSavingField] = useState<string | null>(null);

  useEffect(() => {
    setName(role.name);
    setColor(role.color);
    setPermissions(role.permissions);
  }, [role.id]);

  const isLocked = !canManage;
  const isSystem = role.is_system;

  async function commit(patch: {
    name?: string;
    color?: string;
    permissions?: number;
  }, fieldKey: string) {
    setSavingField(fieldKey);
    try {
      const updated = await updateRole(familyId, role.id, patch);
      onChange(updated);
      // sync локально на случай server-side нормализации
      setName(updated.name);
      setColor(updated.color);
      setPermissions(updated.permissions);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось сохранить");
      // откатываем оптимизм
      setName(role.name);
      setColor(role.color);
      setPermissions(role.permissions);
    } finally {
      setSavingField(null);
    }
  }

  function togglePermBit(bit: number) {
    const next = (permissions & bit) ? permissions & ~bit : permissions | bit;
    setPermissions(next);
    void commit({ permissions: next }, `perm-${bit}`);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Удалить роль «${role.name}»?`,
      description:
        "Все участники потеряют эту роль. Это действие необратимо.",
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRole(familyId, role.id);
      onDeleted(role.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось удалить роль");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 mb-4">
        <input
          type="color"
          value={color}
          disabled={isLocked || isSystem}
          onChange={(e) => setColor(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== role.color) {
              void commit({ color: e.target.value }, "color");
            }
          }}
          className="w-8 h-8 rounded-lg border border-[color:var(--border-glass-strong)] bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          title="Цвет роли"
        />
        <input
          value={name}
          disabled={isLocked || isSystem}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== role.name) {
              void commit({ name: trimmed }, "name");
            } else if (!trimmed) {
              setName(role.name);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none font-display text-2xl text-ink-900 disabled:opacity-70 disabled:cursor-default"
        />
        {!isSystem && canManage && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="ui-btn ui-btn-subtle text-[color:var(--danger-fg-bold)] hover:text-[color:var(--danger-fg-strong)] inline-flex items-center gap-1.5"
            data-tooltip="Удалить роль"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            Удалить
          </button>
        )}
      </header>

      <div className="flex items-center gap-3 mb-4 text-xs font-body text-ink-500">
        <span className="inline-flex items-center gap-1">
          <Users className="w-3 h-3" strokeWidth={2.4} />
          {role.member_count} участн.
        </span>
        {role.is_system && (
          <span className="px-2 py-0.5 rounded-full bg-warm-100 text-warm-700 font-semibold text-[10px] uppercase tracking-wider">
            Системная
          </span>
        )}
        {role.is_preset && !role.is_system && (
          <span className="px-2 py-0.5 rounded-full bg-[color:var(--bg-elevated)] text-ink-500 text-[10px] uppercase tracking-wider">
            Пресет
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll pr-2 -mr-2 space-y-5">
        {catalog?.groups.map((group) => (
          <section key={group.name}>
            <h5 className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body mb-2">
              {group.name}
            </h5>
            <div className="rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface-subtle)] divide-y divide-[color:var(--border-warm-dim)]">
              {group.perms.map((p) => {
                const on = (permissions & p.bit) !== 0;
                const disabled = isLocked || (role.slug === "owner");
                const saving = savingField === `perm-${p.bit}`;
                return (
                  <label
                    key={p.bit}
                    className={classNames(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer transition",
                      disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-white/45",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 accent-warm-500 shrink-0"
                      checked={on}
                      disabled={disabled || saving}
                      onChange={() => togglePermBit(p.bit)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-800 leading-tight">
                        {p.label}
                      </div>
                      <div className="text-xs text-ink-500 font-body mt-0.5 leading-snug">
                        {p.description}
                      </div>
                    </div>
                    {saving && (
                      <Loader2 className="w-3.5 h-3.5 text-ink-400 animate-spin shrink-0 mt-1" strokeWidth={2.2} />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
