"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "warm" | "dark" | "cyberpunk" | "retro" | "sakura";

export const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  { id: "warm", label: "Тёплый", preview: "#c4956a" },
  { id: "dark", label: "Тёмный", preview: "#3d342c" },
  { id: "cyberpunk", label: "Киберпанк", preview: "#00ffc8" },
  { id: "retro", label: "Ретро", preview: "#ff8c00" },
  { id: "sakura", label: "Сакура", preview: "#e8719a" },
];

const STORAGE_KEY = "lentik-theme";
const THEME_IDS = new Set<ThemeId>(THEMES.map((theme) => theme.id));

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "warm",
  setTheme: () => {},
});

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && THEME_IDS.has(value as ThemeId);
}

function readStoredTheme(): ThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(value) ? value : null;
  } catch {
    return null;
  }
}

function getInitialTheme(): ThemeId {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isThemeId(attr)) return attr;
  }
  return readStoredTheme() ?? "warm";
}

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  if (id === "warm") {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light";
  } else {
    document.documentElement.setAttribute("data-theme", id);
    document.documentElement.style.colorScheme = id === "dark" ? "dark" : "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function syncThemeFromStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const nextTheme = isThemeId(event.newValue) ? event.newValue : "warm";
      setThemeState(nextTheme);
    }

    window.addEventListener("storage", syncThemeFromStorage);
    return () => window.removeEventListener("storage", syncThemeFromStorage);
  }, []);

  function setTheme(id: ThemeId) {
    setThemeState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore storage write failures (private mode, quota, etc.)
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
