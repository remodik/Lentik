"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";

type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type NotifyOptions = {
  title: string;
  description?: React.ReactNode;
  buttonLabel?: string;
  tone?: ConfirmTone;
};

type DialogState =
  | {
      kind: "confirm";
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "notify";
      options: NotifyOptions;
      resolve: () => void;
    };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (options: NotifyOptions) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}

const DIALOG_CLOSE_ANIM_MS = 170;

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const close = useCallback((result: boolean) => {
    setDialog((current) => {
      if (!current || closing) return current;
      // Запускаем exit-анимацию, resolve пробрасываем после её завершения.
      setClosing(true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        if (current.kind === "confirm") {
          current.resolve(result);
        } else {
          current.resolve();
        }
        setDialog(null);
        setClosing(false);
      }, DIALOG_CLOSE_ANIM_MS);
      return current;
    });
  }, [closing]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: "confirm", options, resolve });
      }),
    [],
  );

  const notify = useCallback(
    (options: NotifyOptions) =>
      new Promise<void>((resolve) => {
        setDialog({ kind: "notify", options, resolve });
      }),
    [],
  );

  useEffect(() => {
    if (!dialog) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };

    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [close, dialog]);

  const value = useMemo<ConfirmContextValue>(
    () => ({ confirm, notify }),
    [confirm, notify],
  );

  const renderDialog = () => {
    if (!dialog) return null;
    const isConfirm = dialog.kind === "confirm";
    const tone = dialog.options.tone ?? "default";
    const confirmLabel =
      (isConfirm ? (dialog.options as ConfirmOptions).confirmLabel : undefined) ??
      (isConfirm ? "Подтвердить" : (dialog.options as NotifyOptions).buttonLabel ?? "ОК");
    const cancelLabel = isConfirm
      ? (dialog.options as ConfirmOptions).cancelLabel ?? "Отмена"
      : null;

    return (
      <div
        className={`lentik-overlay-anim ${closing ? "is-closing" : ""} fixed inset-0 z-[200] flex items-center justify-center p-4 glass-modal-overlay`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close(false);
        }}
      >
        <div
          className={`lentik-dialog-anim ${closing ? "is-closing" : ""} glass-modal-panel w-full max-w-sm p-6`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span
              className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${
                tone === "danger"
                  ? "bg-[var(--danger-bg-soft)] text-[color:var(--danger-fg-bold)] border border-[color:var(--danger-border-faint)]"
                  : "bg-[color:var(--bg-elevated)] text-ink-700 border border-[color:var(--border-glass-strong)]"
              }`}
              aria-hidden
            >
              {tone === "danger" ? (
                <AlertTriangle className="w-5 h-5" strokeWidth={2.1} />
              ) : (
                <Info className="w-5 h-5" strokeWidth={2.1} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3
                id="confirm-title"
                className="font-display text-lg text-ink-900 leading-snug"
              >
                {dialog.options.title}
              </h3>
              {dialog.options.description !== undefined && dialog.options.description !== null && (
                <div className="text-sm text-ink-500 font-body mt-1.5 leading-relaxed">
                  {dialog.options.description}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            {cancelLabel && (
              <button
                type="button"
                className="ui-btn ui-btn-subtle"
                onClick={() => close(false)}
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              ref={confirmButtonRef}
              className={`ui-btn ${tone === "danger" ? "ui-btn-danger" : "ui-btn-primary"}`}
              onClick={() => close(true)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {mounted && dialog ? createPortal(renderDialog(), document.body) : null}
    </ConfirmContext.Provider>
  );
}
