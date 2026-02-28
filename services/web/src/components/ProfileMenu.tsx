"use client";

import { useEffect, useRef, useState } from "react";
import { type Me } from "@/lib/api";
import SettingsModal from "@/components/SettingsModal";

type Props = {
  me: Me;
  isOwner: boolean;
  onLogout: () => void;
  onUpdate: (updated: Me) => void;
};

export default function ProfileMenu({ me, isOwner, onLogout, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full m-3 p-3 bg-cream-100 rounded-2xl flex items-center gap-3 border border-cream-200
                     hover:bg-cream-200 transition-colors text-left"
          style={{ width: "calc(100% - 24px)" }}
        >
          <div className="w-9 h-9 rounded-full bg-warm-400 flex items-center justify-center text-white text-sm font-bold shrink-0 font-display overflow-hidden">
            {me.avatar_url
              ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
              : me.display_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-900 truncate font-body">{me.display_name}</p>
            <p className="text-xs text-ink-400 font-body">{isOwner ? "👑 Создатель" : "Участник"}</p>
          </div>
          <svg className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-cream-200 rounded-2xl shadow-xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-cream-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warm-400 flex items-center justify-center text-white font-bold font-display shrink-0 overflow-hidden">
                {me.avatar_url
                  ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                  : me.display_name[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 font-body truncate">{me.display_name}</p>
                <p className="text-xs text-ink-400 font-body">@{me.username}</p>
              </div>
            </div>

            <div className="py-1">
              <button
                onClick={() => { setOpen(false); setShowSettings(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink-700 hover:bg-cream-50 transition-colors font-body"
              >
                <span>⚙️</span> Настройки
              </button>
            </div>

            <div className="border-t border-cream-100" />

            <div className="py-1">
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors font-body"
              >
                <span>🚪</span> Выйти
              </button>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          me={me}
          onClose={() => setShowSettings(false)}
          onUpdate={(updated) => { onUpdate(updated); }}
        />
      )}
    </>
  );
}