"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
};

type SelectProps<T extends string = string> = {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  /** Render trigger label for the selected value. Falls back to option label. */
  renderTrigger?: (option: SelectOption<T> | null) => React.ReactNode;
  /** Optional id for accessibility / form labelling. */
  id?: string;
  /** Width preset for the popover relative to the trigger. */
  popoverMinWidth?: number;
};

type PopoverRect = { top: number; left: number; width: number; openUp: boolean };

export default function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Выбрать…",
  disabled,
  className,
  buttonClassName,
  ariaLabel,
  renderTrigger,
  id,
  popoverMinWidth,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [rect, setRect] = useState<PopoverRect | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const positionPopover = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const desiredHeight = Math.min(320, options.length * 44 + 16);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < desiredHeight + 16 && r.top > spaceBelow;
    const width = Math.max(r.width, popoverMinWidth ?? 0);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setRect({
      top: openUp ? r.top - 4 : r.bottom + 4,
      left: Math.max(8, left),
      width,
      openUp,
    });
  }, [options.length, popoverMinWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    positionPopover();
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => positionPopover();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const initial = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(initial >= 0 ? initial : options.findIndex((o) => !o.disabled));
  }, [open, options, value]);

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        if (options.length === 0) return -1;
        let next = current;
        for (let i = 0; i < options.length; i++) {
          next = (next + delta + options.length) % options.length;
          if (!options[next]?.disabled) return next;
        }
        return current;
      });
    },
    [options],
  );

  const commit = useCallback(
    (option: SelectOption<T>) => {
      if (option.disabled) return;
      onChange(option.value);
      setOpen(false);
      requestAnimationFrame(() => buttonRef.current?.focus());
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(options.findIndex((o) => !o.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setActiveIndex(i);
          break;
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) commit(opt);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const trigger = renderTrigger
    ? renderTrigger(selected)
    : selected?.label ?? (
        <span className="text-ink-400">{placeholder}</span>
      );

  const popover =
    mounted && open && rect ? (
      createPortal(
        <div
          ref={listRef}
          role="listbox"
          aria-labelledby={id}
          className="lentik-popover z-[300] fixed rounded-2xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-surface-strong)] backdrop-blur-xl shadow-[0_20px_60px_var(--scrim-3)] overflow-hidden"
          style={{
            top: rect.openUp ? "auto" : rect.top,
            bottom: rect.openUp ? window.innerHeight - rect.top : "auto",
            left: rect.left,
            width: rect.width,
            maxHeight: 320,
            transformOrigin: rect.openUp ? "bottom center" : "top center",
          }}
        >
          <div className="overflow-y-auto py-1.5 max-h-[320px]">
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onClick={() => commit(opt)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition ${
                    opt.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : isActive
                        ? "bg-[color:var(--bg-elevated)] text-ink-900"
                        : "text-ink-700 hover:bg-[color:var(--bg-elevated)]"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 shrink-0 ${
                      isSelected ? "text-ink-900" : "text-transparent"
                    }`}
                    aria-hidden
                  >
                    <Check className="w-4 h-4" strokeWidth={2.4} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium leading-snug truncate">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="block text-xs text-ink-400 font-body mt-0.5">
                        {opt.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    ) : null;

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={
          buttonClassName ??
          `input-field w-full inline-flex items-center justify-between gap-2 text-left ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`
        }
      >
        <span className="min-w-0 truncate flex-1">{trigger}</span>
        <ChevronDown
          className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.2}
        />
      </button>
      {popover}
    </div>
  );
}
