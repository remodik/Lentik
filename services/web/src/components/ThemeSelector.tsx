"use client";

import { Check } from "lucide-react";
import { THEMES, useTheme } from "@/components/ThemeProvider";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-ink-900 leading-tight">Оформление</h2>
        <p className="text-sm text-ink-400 font-body mt-1">Выберите тему интерфейса приложения</p>
      </div>

      <div className="theme-grid" role="radiogroup" aria-label="Тема интерфейса">
        {THEMES.map((item) => {
          const active = item.id === theme;

          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(item.id)}
              className={`theme-option ${active ? "active" : ""}`}
              title={item.label}
            >
              <span className="theme-option-preview" style={{ backgroundColor: item.preview }} aria-hidden />
              <span className="theme-option-label">{item.label}</span>
              {active && (
                <span className="theme-option-check" aria-hidden>
                  <Check className="w-3.5 h-3.5" strokeWidth={2.7} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
