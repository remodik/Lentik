"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type ContextMenuItem = {
  type?: "item";
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export type ContextMenuSeparator = { type: "separator" };
export type ContextMenuLabel = { type: "label"; label: string };

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSeparator
  | ContextMenuLabel;

function isActionable(e: ContextMenuEntry): e is ContextMenuItem {
  return (!e.type || e.type === "item") && !(e as ContextMenuItem).disabled;
}

/**
 * Генерик-рендерер контекстного меню (Discord-style). Позиционируется по
 * координатам курсора, закрывается по клику-вне/Esc/скроллу. Поддерживает
 * клавиатурную навигацию ↑/↓/Enter.
 */
export default function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number>(-1);

  const actionableIdx = useMemo(
    () => entries.map((e, i) => (isActionable(e) ? i : -1)).filter((i) => i >= 0),
    [entries],
  );

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (actionableIdx.length === 0) return;
        const pos = actionableIdx.indexOf(active);
        const next =
          e.key === "ArrowDown"
            ? actionableIdx[(pos + 1 + actionableIdx.length) % actionableIdx.length]
            : actionableIdx[(pos - 1 + actionableIdx.length) % actionableIdx.length];
        setActive(next);
      }
      if (e.key === "Enter" && active >= 0) {
        const entry = entries[active];
        if (entry && isActionable(entry)) {
          entry.onClick();
          onClose();
        }
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, active, actionableIdx, entries]);

  // Не выходим за правый/нижний край экрана.
  const left = typeof window !== "undefined" ? Math.min(x, window.innerWidth - 240) : x;
  const top =
    typeof window !== "undefined"
      ? Math.min(y, window.innerHeight - entries.length * 40 - 20)
      : y;

  return (
    <div
      ref={ref}
      className="fixed z-[95] min-w-[210px] max-w-[280px] rounded-2xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-1.5 shadow-[0_20px_60px_var(--scrim-4)]"
      style={{ left, top }}
      role="menu"
    >
      {entries.map((entry, i) => {
        if (entry.type === "separator") {
          return <div key={`sep-${i}`} className="my-1 h-px bg-[color:var(--border-glass)]" />;
        }
        if (entry.type === "label") {
          return (
            <p
              key={`lbl-${i}`}
              className="px-3 py-1 text-[11px] uppercase tracking-wider text-ink-400 font-body"
            >
              {entry.label}
            </p>
          );
        }
        const Icon = entry.icon;
        return (
          <button
            key={`${entry.label}-${i}`}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              if (entry.disabled) return;
              entry.onClick();
              onClose();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-body transition text-left disabled:opacity-40 disabled:cursor-not-allowed ${
              entry.danger
                ? "text-[color:var(--danger-fg-bold)] hover:bg-[var(--danger-bg-soft)]"
                : "text-ink-700 hover:bg-[var(--bg-surface-strong)]"
            } ${active === i && !entry.disabled ? (entry.danger ? "bg-[var(--danger-bg-soft)]" : "bg-[var(--bg-surface-strong)]") : ""}`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" strokeWidth={2.1} />}
            <span className="truncate">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
