"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  storageKey?: string;
  initial: number;
  min: number;
  max: number;
  /** Какую сторону тянет хэндл — нужна для подсчёта delta. */
  side?: "right" | "left";
};

/**
 * Resize, но ручка активируется только при зажатом Ctrl.
 * Возвращает текущую ширину и пропсы для самого хэндла + флаг готовности.
 *
 * Использование:
 *   const { width, handleProps, dragging, ctrlReady } = useCtrlResize({
 *     storageKey: "lentik:chat-sidebar",
 *     initial: 288, min: 220, max: 520, side: "right",
 *   });
 *   <aside style={{ width }} className="relative">
 *     ... содержимое ...
 *     <div {...handleProps} className="absolute top-0 bottom-0 right-0 w-1.5 ..." />
 *   </aside>
 */
export function useCtrlResize({
  storageKey,
  initial,
  min,
  max,
  side = "right",
}: Options) {
  const [width, setWidth] = useState<number>(initial);
  const [ctrlReady, setCtrlReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const hydratedRef = useRef(false);

  // Поднимаем сохранённую ширину после маунта — без рассинхронизации с SSR.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed)) {
        setWidth(Math.min(max, Math.max(min, parsed)));
      }
    } catch {}
  }, [max, min, storageKey]);

  // Глобально слежу за Ctrl, чтобы хэндл подсвечивался только тогда.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.ctrlKey) setCtrlReady(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control" && !e.ctrlKey) setCtrlReady(false);
    };
    const blur = () => setCtrlReady(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Запоминаем ширину в localStorage (только после первой гидрации).
  useEffect(() => {
    if (!storageKey || !hydratedRef.current) return;
    try {
      window.localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {}
  }, [storageKey, width]);

  // Mouse move / up — обработчики живут только во время drag.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const raw = side === "right" ? startRef.current.w + dx : startRef.current.w - dx;
      const clamped = Math.min(max, Math.max(min, raw));
      setWidth(clamped);
    };
    const onUp = () => {
      setDragging(false);
      startRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, max, min, side]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Только Ctrl-click активирует ресайз.
      if (!e.ctrlKey) return;
      e.preventDefault();
      startRef.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    [width],
  );

  const handleProps = {
    onMouseDown,
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    title: "Ctrl + перетащите, чтобы изменить ширину",
  };

  return { width, setWidth, handleProps, dragging, ctrlReady };
}
