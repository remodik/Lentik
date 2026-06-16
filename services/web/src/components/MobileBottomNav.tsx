"use client";

import type { LucideIcon } from "lucide-react";
import type { AppSection } from "@/components/AppLayout";

export type MobileNavSection = { id: AppSection; label: string };
export type MobileNavCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  sections: MobileNavSection[];
};

type Props = {
  section: AppSection;
  onSection: (s: AppSection) => void;
  categories: MobileNavCategory[];
};

export default function MobileBottomNav({ section, onSection, categories }: Props) {
  const activeCategory =
    categories.find((c) => c.sections.some((s) => s.id === section)) ?? categories[0];
  const subSections = activeCategory?.sections ?? [];

  return (
    <div className="mobile-nav-wrap">
      {subSections.length > 1 && (
        <div
          className="mobile-subnav"
          role="tablist"
          aria-label={`Разделы: ${activeCategory?.label ?? ""}`}
        >
          {subSections.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`mobile-subnav-pill ${active ? "active" : ""}`}
                onClick={() => onSection(s.id)}
                data-testid={`mobile-subnav-${s.id}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Навигация приложения">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory?.id === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                // Переключение на категорию ведёт на её первый раздел; если уже
                // в этой категории — ничего не делаем (раздел меняется пилюлями).
                const first = cat.sections[0];
                if (!isActive && first) onSection(first.id);
              }}
              className={`mobile-nav-tab ${isActive ? "active" : ""}`}
              data-testid={`mobile-nav-${cat.id}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="mobile-nav-icon-wrap" aria-hidden>
                <Icon style={{ width: 26, height: 26 }} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              <span className="mobile-nav-label">{cat.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
