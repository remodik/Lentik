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
 * Портальный тултип. Позиционируется относительно viewport, не обрезается
 * overflow-hidden родителей и всегда поверх (z-[10000]).
 *
 * Использование:
 *   <Tooltip content="Удалить роль">
 *     <button>...</button>
 *   </Tooltip>
 */
export default function Tooltip({
  content,
  children,
  placement: forcedPlacement,
  className,
}: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);
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

  const scheduleHide = () => {
    clearHide();
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPos(null);
    }, 60);
  };

  const show = () => {
    clearHide();
    setOpen(true);
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const gap = 8;
    const arrowH = 6;

    // Предпочтительное размещение
    let placement: "top" | "bottom" = forcedPlacement || "top";
    if (!forcedPlacement) {
      const spaceAbove = rect.top;
      const spaceBelow = vh - rect.bottom;
      // Если сверху мало места — показываем снизу
      if (spaceAbove < 50 && spaceBelow > spaceAbove) {
        placement = "bottom";
      }
    }

    const centerX = rect.left + rect.width / 2;

    // Оцениваем высоту баббла (шрифт 12 + padding 6*2 + border ~ 26-30px)
    const estBubbleH = 28;

    let left = centerX;
    let top: number;

    if (placement === "top") {
      // Баббл + стрелка над триггером.
      // Позиционируем так, чтобы низ стрелки был чуть выше триггера.
      top = rect.top - gap - arrowH;
      // bubble будет выше через transform
    } else {
      top = rect.bottom + gap;
    }

    // Горизонтальный клемп (с запасом)
    const minLeft = 8;
    const maxLeft = vw - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    setPos({ left, top, placement });
  };

  // Обновляем позицию когда открываем или меняется размер окна
  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onReposition = () => {
      // При скролле/ресайзе просто прячем — надёжнее, чем пытаться следить
      // (как делают в ContextMenu и некоторых поповерах).
      setOpen(false);
      setPos(null);
    };

    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, content, forcedPlacement]);

  // После маунта баббла чуть подправляем позицию по реальной высоте
  useEffect(() => {
    if (open && pos && bubbleRef.current) {
      // Можно добавить точный расчёт при желании, но для односложных тултипов не критично.
    }
  }, [open, pos]);

  // Клонируем обработчики на ребёнка + ref
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

      // Поддержка существующего ref у ребёнка
      const origRef = (childElement as any).ref;
      if (typeof origRef === "function") {
        origRef(node);
      } else if (origRef && typeof origRef === "object") {
        (origRef as React.MutableRefObject<any>).current = node;
      }
    },
  });

  const renderTooltip = () => {
    if (!mounted || !open || !pos) return null;

    const { left, top, placement } = pos;
    const isTop = placement === "top";

    return createPortal(
      <div
        className="fixed z-[10000] pointer-events-none"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          transform: "translateX(-50%)",
        }}
        aria-hidden="true"
      >
        <div ref={bubbleRef} className="relative flex flex-col items-center">
          {isTop && (
            <div
              className="tooltip-bubble bg-[#1a1a1a] text-white text-[12px] font-medium font-body whitespace-nowrap rounded-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.32),0_0_0_1px_rgba(255,255,255,0.04)] px-[10px] py-[6px]"
            >
              {content}
            </div>
          )}

          {/* Arrow */}
          <div
            className={
              isTop
                ? "w-0 h-0 border-l-[5px] border-r-[5px] border-l-transparent border-r-transparent border-t-[6px] border-t-[#1a1a1a] -mt-[1px]"
                : "w-0 h-0 border-l-[5px] border-r-[5px] border-l-transparent border-r-transparent border-b-[6px] border-b-[#1a1a1a] -mb-[1px]"
            }
          />

          {!isTop && (
            <div
              className="tooltip-bubble bg-[#1a1a1a] text-white text-[12px] font-medium font-body whitespace-nowrap rounded-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.32),0_0_0_1px_rgba(255,255,255,0.04)] px-[10px] py-[6px]"
            >
              {content}
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <span className={className ? `inline-block align-middle ${className}` : "inline-block align-middle"}>
        {trigger}
      </span>
      {renderTooltip()}
    </>
  );
}
