"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Loader2, X } from "lucide-react";
import {
  getMemberRoles,
  getRoles,
  setMemberRoles,
  type FamilyRole,
} from "@/lib/api";

const CLOSE_ANIM_MS = 170;

type Props = {
  open: boolean;
  familyId: string;
  member: {
    user_id: string;
    display_name: string;
    username: string;
  };
  /** true → могу выдавать owner-роль и ADMINISTRATOR (только текущий владелец). */
  canAssignOwner: boolean;
  onClose: () => void;
  onChanged: (userId: string, roleIds: string[]) => void;
};

const ADMINISTRATOR_BIT = 1 << 31;

export default function MemberRolesModal({
  open,
  familyId,
  member,
  canAssignOwner,
  onClose,
  onChanged,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [allRoles, setAllRoles] = useState<FamilyRole[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [originalSelected, setOriginalSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setError("");
    setLoading(true);
    Promise.all([getRoles(familyId), getMemberRoles(familyId, member.user_id)])
      .then(([all, mine]) => {
        setAllRoles(all);
        const ids = new Set(mine.map((r) => r.id));
        setSelected(ids);
        setOriginalSelected(new Set(ids));
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить роли");
      })
      .finally(() => setLoading(false));
  }, [open, familyId, member.user_id]);

  const triggerClose = () => {
    if (closing) return;
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setClosing(false);
    }, CLOSE_ANIM_MS);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasChanges = useMemo(() => {
    if (selected.size !== originalSelected.size) return true;
    for (const id of selected) if (!originalSelected.has(id)) return true;
    return false;
  }, [selected, originalSelected]);

  function toggle(roleId: string, disabled: boolean) {
    if (disabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      // @everyone backend всё равно вернёт принудительно — отправляем без неё.
      const toSend = Array.from(selected);
      await setMemberRoles(familyId, member.user_id, toSend);
      onChanged(member.user_id, toSend);
      triggerClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`lentik-overlay-anim ${closing ? "is-closing" : ""} fixed inset-0 z-[180] bg-black/45 backdrop-blur-sm p-4 flex items-center justify-center`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Роли участника ${member.display_name}`}
    >
      <div
        className={`lentik-dialog-anim ${closing ? "is-closing" : ""} w-full max-w-md flex flex-col rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl shadow-[0_30px_90px_var(--scrim-4)] overflow-hidden max-h-[80vh]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-[color:var(--border-warm-dim)]">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-body">
              Роли участника
            </p>
            <h3 className="font-display text-xl text-ink-900 truncate mt-0.5">
              {member.display_name}
            </h3>
            <p className="text-[11px] text-ink-400 font-body truncate">
              @{member.username}
            </p>
          </div>
          <button
            type="button"
            onClick={triggerClose}
            className="w-9 h-9 rounded-lg grid place-items-center text-ink-500 hover:text-ink-900 hover:bg-white/70 transition shrink-0"
            aria-label="Закрыть"
            data-tooltip="Закрыть (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 min-h-0">
          {loading ? (
            <div className="flex items-center gap-2 text-ink-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
              Загрузка…
            </div>
          ) : (
            <ul className="space-y-1">
              {allRoles.map((role) => {
                const checked = selected.has(role.id);
                const isOwnerRole = role.slug === "owner";
                const isAdminRole =
                  (role.permissions & ADMINISTRATOR_BIT) !== 0;
                const lockedByOwnerRule =
                  (isOwnerRole || isAdminRole) && !canAssignOwner;
                const forcedAlways = role.is_everyone;
                const disabled = lockedByOwnerRule || forcedAlways;

                return (
                  <li key={role.id}>
                    <label
                      className={`flex items-start gap-3 px-3 py-2 rounded-xl transition ${
                        disabled
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:bg-white/55"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked || forcedAlways}
                        disabled={disabled}
                        onChange={() => toggle(role.id, disabled)}
                        className="mt-1 w-4 h-4 accent-warm-500 shrink-0"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                        style={{ background: role.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-900 leading-tight inline-flex items-center gap-1.5">
                          {role.name}
                          {isOwnerRole && (
                            <Crown className="w-3 h-3 text-warm-500" strokeWidth={2.4} />
                          )}
                        </div>
                        <div className="text-[11px] text-ink-400 font-body mt-0.5">
                          {role.member_count} участн.
                          {forcedAlways && " · присваивается всем"}
                          {lockedByOwnerRule && " · только владелец"}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="text-sm text-red-500 font-body mt-3 px-3">{error}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[color:var(--border-warm-dim)]">
          <button
            type="button"
            className="ui-btn ui-btn-subtle"
            onClick={triggerClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges || loading}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
