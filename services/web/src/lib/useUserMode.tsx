"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { updateUiMode, type UiMode } from "@/lib/api";

const STORAGE_KEY = "lentik:ui-mode";

type Ctx = {
  mode: UiMode;
  isAdvanced: boolean;
  setMode: (next: UiMode) => Promise<void>;
};

const UserModeContext = createContext<Ctx | null>(null);

export function UserModeProvider({
  initialMode = "simple",
  children,
}: {
  initialMode?: UiMode;
  children: React.ReactNode;
}) {
  const [mode, setLocalMode] = useState<UiMode>(initialMode);

  // Поднимаем сохранённое значение после маунта (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "simple" || raw === "advanced") {
        setLocalMode(raw);
      }
    } catch {}
  }, []);

  // Если снаружи (через initialMode из /me) пришло другое значение — синхронизируемся.
  useEffect(() => {
    setLocalMode(initialMode);
  }, [initialMode]);

  const setMode = useCallback(async (next: UiMode) => {
    setLocalMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    // Best-effort sync с бэком. Если упадёт — локально всё равно сохранили.
    try {
      await updateUiMode(next);
    } catch (e) {
      console.warn("updateUiMode failed", e);
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ mode, isAdvanced: mode === "advanced", setMode }),
    [mode, setMode],
  );

  return (
    <UserModeContext.Provider value={value}>{children}</UserModeContext.Provider>
  );
}

export function useUserMode(): Ctx {
  const ctx = useContext(UserModeContext);
  if (!ctx) {
    // Безопасный фолбэк — компоненты, не обёрнутые в Provider (например,
    // landing-страница) просто работают в simple-режиме.
    return {
      mode: "simple",
      isAdvanced: false,
      setMode: async () => {},
    };
  }
  return ctx;
}
