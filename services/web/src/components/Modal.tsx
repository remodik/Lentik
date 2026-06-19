"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

/**
 * Базовый модальный примитив: затемнение + центрирование + закрытие по клику на
 * фон и Esc. Заменяет ручную сборку `fixed inset-0 bg-black/.. backdrop-blur`,
 * которая копировалась по компонентам. Все цвета — из токенов.
 */
export default function Modal({
  onClose,
  title,
  eyebrow,
  size = "md",
  closeOnBackdrop = true,
  children,
  ariaLabel,
}: {
  onClose: () => void;
  /** Заголовок в шапке. Если не задан — шапка не рендерится. */
  title?: string;
  /** Мелкая надпись над заголовком (uppercase). */
  eyebrow?: string;
  size?: keyof typeof SIZES;
  /** Блокировать закрытие по клику на фон (например, во время загрузки). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-[var(--bg-overlay)] backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={() => closeOnBackdrop && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div
        className={`w-full ${SIZES[size]} flex flex-col max-h-[calc(100dvh-2rem)] rounded-3xl border border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] backdrop-blur-2xl p-6 shadow-[0_30px_90px_var(--scrim-4)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
            <div>
              {eyebrow && (
                <p className="text-xs uppercase tracking-[0.14em] text-ink-400 font-body">
                  {eyebrow}
                </p>
              )}
              <h3 className="font-display text-xl text-ink-900 mt-0.5">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-[var(--bg-surface)] transition shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" strokeWidth={2.3} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto sidebar-scroll min-h-0 -mr-2 pr-2">
          {children}
        </div>
      </div>
    </div>
  );
}
