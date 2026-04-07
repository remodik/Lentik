"use client";

import { Images, MessageCircle, Users } from "lucide-react";
import type { AppSection } from "@/components/AppLayout";

type Props = {
  section: AppSection;
  onSection: (s: AppSection) => void;
};

const TABS = [
  { id: "gallery" as AppSection, icon: Images, label: "Фото" },
  { id: "chat" as AppSection, icon: MessageCircle, label: "Чат" },
  { id: "members" as AppSection, icon: Users, label: "Семья" },
];

export default function MobileBottomNav({ section, onSection }: Props) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Навигация приложения">
      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = section === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSection(id)}
            className={`mobile-nav-tab ${isActive ? "active" : ""}`}
            data-testid={`mobile-nav-${id}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="mobile-nav-icon-wrap" aria-hidden>
              <Icon
                style={{ width: 26, height: 26 }}
                strokeWidth={isActive ? 2.4 : 2}
              />
            </span>
            <span className="mobile-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
