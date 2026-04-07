"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, LogOut, Settings } from "lucide-react";
import { type Me } from "@/lib/api";
import SettingsModal from "@/components/SettingsModal";
import { getPresenceLabel } from "@/lib/presence";

type Props = {
  me: Me;
  isOwner: boolean;
  onLogout: () => void;
  onUpdate: (updated: Me) => void;
};

export default function ProfileMenu({
  me,
  isOwner,
  onLogout,
  onUpdate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showSettings, setSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isOnline = me.is_online === true;
  const presenceLabel = getPresenceLabel(me, {
    onlineLabel: "Сейчас в сети",
    offlineLabel: "Не в сети",
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="profile-menu" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`profile-trigger ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-haspopup="menu"
          type="button"
        >
          <Avatar me={me} size={36} ring={open} />

          <div className="profile-trigger__text">
            <p className="profile-name">{me.display_name}</p>
            <p className="profile-sub flex items-center gap-1.5">
              {isOwner && <Crown className="w-3 h-3 text-warm-500" strokeWidth={2.3} />}
              <span>{isOwner ? "Создатель" : "Участник"}</span>
            </p>
          </div>

          <ChevronDown
            className={`profile-chevron ${open ? "open" : ""}`}
            strokeWidth={2.5}
            aria-hidden
          />
        </button>

        {open && <div className="profile-backdrop" aria-hidden />}

        {open && (
          <div
            className="profile-popover glass-dropdown glossy"
            role="menu"
            aria-label="Меню профиля"
          >
            <div className="profile-popover__head">
              <Avatar me={me} size={40} ring />
              <div className="min-w-0">
                <p className="profile-popover__name">{me.display_name}</p>
                <p className="profile-popover__user">@{me.username}</p>
                <p className={`profile-presence ${isOnline ? "online" : ""}`} title={presenceLabel}>
                  <span className={`profile-presence-dot ${isOnline ? "online" : "offline"}`} aria-hidden />
                  <span className="truncate">{presenceLabel}</span>
                </p>
              </div>
            </div>

            <div className="profile-popover__group">
              <MenuRow
                icon={<Settings className="w-4 h-4" strokeWidth={2.1} />}
                label="Настройки профиля"
                onClick={() => {
                  setOpen(false);
                  setSettings(true);
                }}
              />
            </div>

            <div className="profile-sep" />

            <div className="profile-popover__group">
              <MenuRow
                icon={<LogOut className="w-4 h-4" strokeWidth={2.1} />}
                label="Выйти"
                danger
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              />
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          me={me}
          onClose={() => setSettings(false)}
          onUpdate={(m) => onUpdate(m)}
        />
      )}
    </>
  );
}

function Avatar({ me, size, ring }: { me: Me; size: number; ring?: boolean }) {
  const initial = me.display_name[0]?.toUpperCase() ?? "?";

  return (
    <div
      className={`profile-avatar ${ring ? "ring" : ""}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden
    >
      {me.avatar_url ? (
        <img
          src={me.avatar_url}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`profile-row ${danger ? "danger" : ""}`}
      type="button"
      role="menuitem"
    >
      <span className={`profile-row__ic ${danger ? "danger" : ""}`} aria-hidden>
        {icon}
      </span>
      <span className="profile-row__label">{label}</span>
    </button>
  );
}
