"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UserPopoverState<T> = {
  user: T;
  anchorRect: DOMRect;
  anchorKey: string;
};

export function useUserPopover<T>() {
  const [state, setState] = useState<UserPopoverState<T> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const activeAnchorKey = state?.anchorKey ?? null;

  const closePopover = useCallback(() => {
    anchorRef.current = null;
    setState(null);
  }, []);

  const openPopover = useCallback((user: T, anchor: HTMLElement, anchorKey: string) => {
    const rect = anchor.getBoundingClientRect();

    setState((prev) => {
      if (prev && anchorRef.current === anchor) {
        anchorRef.current = null;
        return null;
      }

      anchorRef.current = anchor;
      return { user, anchorRect: rect, anchorKey };
    });
  }, []);

  useEffect(() => {
    if (!activeAnchorKey) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) {
        closePopover();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      setState((prev) => {
        if (!prev || prev.anchorKey !== activeAnchorKey) return prev;
        return { ...prev, anchorRect: rect };
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      closePopover();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeAnchorKey, closePopover]);

  return useMemo(
    () => ({
      popoverUser: state?.user ?? null,
      popoverAnchorRect: state?.anchorRect ?? null,
      popoverOpenKey: activeAnchorKey,
      popoverRef,
      openPopover,
      closePopover,
    }),
    [activeAnchorKey, closePopover, openPopover, state?.anchorRect, state?.user],
  );
}
