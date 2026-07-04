"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  /** Текст подсказки */
  content: string;
  children: React.ReactElement;
  /** Положение относительно триггера */
  placement?: "top" | "bottom";
  /** Дополнительный класс на обёртку */
  className?: string;
}

/**
 * Портальный тултип в стиле Discord. Позиционируется относительно viewport
 * (не режется overflow-hidden), всегда поверх (z-[10000]), с плавной
 * анимацией появления/скрытия.
 *
 * По умолчанию показывается СВЕРХУ триггера (даже поверх плавающих панелей).
 * Вниз перемещается только если сверху нет места — триггер у самого верха
 * экрана.
 */
export default function Tooltip({
  content,
  children,
  placement: forcedPlacement,
  className,
}: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);

  const [pos, setPos] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);
  // open — логическое «хотим показать»; render — в DOM (живёт до конца
  // анимации ухода); active — CSS-видимость (запускает transition).
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const clearHide = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const gap = 8;

    // По умолчанию — сверху. Флип вниз только если триггер у верхнего края
    // экрана (баббл + стрелка + зазор не помещаются над ним).
    let placement: "top" | "bottom" = forcedPlacement || "top";
    if (!forcedPlacement) {
      const estBubbleH = 34;
      if (rect.top < estBubbleH + gap) placement = "bottom";
    }

    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX, 10), vw - 10);
    const top = placement === "top" ? rect.top - gap : rect.bottom + gap;

    setPos({ left, top, placement });
  };

  const show = () => {
    clearHide();
    updatePosition();
    setOpen(true);
  };

  const scheduleHide = () => {
    clearHide();
    hideTimerRef.current = window.setTimeout(() => setOpen(false), 60);
  };

  // open → появление; !open → доиграть уход и размонтировать.
  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    if (render) {
      setActive(false);
      const t = window.setTimeout(() => {
        setRender(false);
        setPos(null);
      }, 140);
      return () => window.clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Как только смонтировались с открытым состоянием — на следующем кадре
  // включаем active, чтобы отработал transition входа.
  useEffect(() => {
    if (render && open) {
      const r = requestAnimationFrame(() => setActive(true));
      return () => cancelAnimationFrame(r);
    }
  }, [render, open]);

  // Репозиция/скрытие при скролле и ресайзе.
  useEffect(() => {
    if (!open) return;
    const onReposition = () => setOpen(false);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  // Клонируем обработчики на ребёнка + ref.
  const childElement = React.Children.only(children) as React.ReactElement<any>;
  const mergedHandlers = {
    onMouseEnter: (e: React.MouseEvent) => {
      childElement.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childElement.props.onMouseLeave?.(e);
      scheduleHide();
    },
    onFocus: (e: React.FocusEvent) => {
      childElement.props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      childElement.props.onBlur?.(e);
      scheduleHide();
    },
  };

  const trigger = React.cloneElement(childElement, {
    ...mergedHandlers,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const origRef = (childElement as any).ref;
      if (typeof origRef === "function") {
        origRef(node);
      } else if (origRef && typeof origRef === "object") {
        (origRef as React.MutableRefObject<any>).current = node;
      }
    },
  });

  const renderTooltip = () => {
    if (!mounted || !render || !pos) return null;

    const { left, top, placement } = pos;
    const isTop = placement === "top";

    // Базовый сдвиг: для top баббл поднимается на свою высоту (-100%),
    // для bottom растёт вниз (0). Анимация — небольшой «наезд» + scale.
    const baseY = isTop ? "-100%" : "0%";
    const nudge = active ? "0px" : isTop ? "4px" : "-4px";
    const scale = active ? 1 : 0.96;

    const bubble = (
      <div className="bg-[#1a1a1a] text-white text-[12px] font-medium font-body whitespace-nowrap rounded-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.32),0_0_0_1px_rgba(255,255,255,0.04)] px-[10px] py-[6px]">
        {content}
      </div>
    );
    const arrow = (
      <div
        className={
          isTop
            ? "w-0 h-0 border-l-[5px] border-r-[5px] border-l-transparent border-r-transparent border-t-[6px] border-t-[#1a1a1a] -mt-[1px]"
            : "w-0 h-0 border-l-[5px] border-r-[5px] border-l-transparent border-r-transparent border-b-[6px] border-b-[#1a1a1a] -mb-[1px]"
        }
      />
    );

    return createPortal(
      <div
        className="fixed z-[10000] pointer-events-none"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          opacity: active ? 1 : 0,
          transform: `translateX(-50%) translateY(calc(${baseY} + ${nudge})) scale(${scale})`,
          transformOrigin: isTop ? "bottom center" : "top center",
          transition:
            "opacity 130ms ease, transform 130ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-hidden="true"
      >
        <div className="relative flex flex-col items-center">
          {isTop ? (
            <>
              {bubble}
              {arrow}
            </>
          ) : (
            <>
              {arrow}
              {bubble}
            </>
          )}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <span
        className={
          className
            ? `inline-block align-middle ${className}`
            : "inline-block align-middle"
        }
      >
        {trigger}
      </span>
      {renderTooltip()}
    </>
  );
}
