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

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "warm",
  setTheme: () => {},
});

function applyTheme(id: ThemeId) {
  if (id === "warm") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("warm");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES.find((t) => t.id === saved)) {
      applyTheme(saved);
      setThemeState(saved);
    }
  }, []);

  function setTheme(id: ThemeId) {
    applyTheme(id);
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
