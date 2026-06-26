"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Crown,
  HousePlus,
  Link2,
  LogOut,
  Pencil,
  Settings,
  X,
} from "lucide-react";
import { type Me, type MyFamily } from "@/lib/api";
import SettingsModal from "@/components/SettingsModal";

type Props = {
  me: Me;
  activeFamilyId: string;
  myFamilies: MyFamily[];
  onClose: () => void;
  onFamilySwitch: (familyId: string) => void;
  onCreateFamily: () => void;
  onJoinFamily?: () => void;
  onRenameFamily?: (familyId: string, currentName: string) => void;
  onOpenFamilySettings?: () => void;
  onLogout: () => void;
  onMeUpdate: (m: Me) => void;
};

/**
 * Мобильный drawer профиля (md:hidden). На мобиле сайдбар скрыт, поэтому весь
 * доступ к профилю, переключению семей и их настройкам собран здесь. Выезжает
 * снизу, закрывается тапом по фону / Esc / крестику.
 */
export default function MobileProfileSheet({
  me,
  activeFamilyId,
  myFamilies,
  onClose,
  onFamilySwitch,
  onCreateFamily,
  onJoinFamily,
  onRenameFamily,
  onOpenFamilySettings,
  onLogout,
  onMeUpdate,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const initial = me.display_name?.[0]?.toUpperCase() ?? "?";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="md:hidden fixed inset-0 z-[120] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-label="Профиль и семьи"
      >
        <div
          className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />

        <div className="cal-sheet-panel relative z-10 max-h-[85vh] flex flex-col overflow-hidden rounded-t-3xl border-t border-[color:var(--border-glass-strong)] bg-[color:var(--bg-elevated)] shadow-[0_-20px_60px_var(--scrim-4)]">
          {/* Шапка с профилем */}
          <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[color:var(--border-warm-dim)]">
            <div className="w-12 h-12 rounded-full overflow-hidden grid place-items-center bg-gradient-to-br from-warm-300 via-warm-400 to-warm-500 text-white font-display text-lg shrink-0">
              {me.avatar_url ? (
                <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-ink-900 leading-tight truncate">
                {me.display_name}
              </p>
              <p className="text-[12px] text-ink-400 font-body truncate">@{me.username}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-icon shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" strokeWidth={2.3} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-4 space-y-4">
            {/* Профиль */}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] text-left active:scale-[0.99] transition"
            >
              <Settings className="w-5 h-5 text-ink-600 shrink-0" strokeWidth={2.1} />
              <span className="text-[15px] font-semibold text-ink-800 font-body">
                Настройки профиля
              </span>
            </button>

            {/* Семьи */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400 font-body px-1 mb-2">
                Ваши семьи
              </p>
              <div className="space-y-1.5">
                {myFamilies.map((item) => {
                  const isActive = item.family_id === activeFamilyId;
                  const canRename = item.role === "owner" && onRenameFamily;
                  return (
                    <div
                      key={item.family_id}
                      className="flex items-center gap-1.5 rounded-2xl border px-3 py-3"
                      style={{
                        borderColor: isActive
                          ? "var(--accent-border)"
                          : "var(--border-glass)",
                        background: isActive
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                      }}
                    >
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                        onClick={() => {
                          if (!isActive) onFamilySwitch(item.family_id);
                          onClose();
                        }}
                      >
                        <span className="text-[15px] font-semibold text-ink-800 font-body truncate flex-1">
                          {item.family_name}
                        </span>
                        {isActive && (
                          <Check className="w-4 h-4 text-[color:var(--accent)] shrink-0" strokeWidth={2.6} />
                        )}
                      </button>
                      {canRename && (
                        <button
                          type="button"
                          onClick={() => {
                            onRenameFamily?.(item.family_id, item.family_name);
                            onClose();
                          }}
                          className="ui-btn ui-btn-icon shrink-0"
                          aria-label={`Переименовать семью «${item.family_name}»`}
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={2.3} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onCreateFamily();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] text-left active:scale-[0.99] transition"
                >
                  <HousePlus className="w-5 h-5 text-ink-600 shrink-0" strokeWidth={2.1} />
                  <span className="text-[15px] font-semibold text-ink-800 font-body">
                    Создать семью
                  </span>
                </button>
                {onJoinFamily && (
                  <button
                    type="button"
                    onClick={() => {
                      onJoinFamily();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] text-left active:scale-[0.99] transition"
                  >
                    <Link2 className="w-5 h-5 text-ink-600 shrink-0" strokeWidth={2.1} />
                    <span className="text-[15px] font-semibold text-ink-800 font-body">
                      Вступить по приглашению
                    </span>
                  </button>
                )}
                {onOpenFamilySettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFamilySettings();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-[color:var(--border-glass)] bg-[color:var(--bg-surface)] text-left active:scale-[0.99] transition"
                  >
                    <Crown className="w-5 h-5 text-ink-600 shrink-0" strokeWidth={2.1} />
                    <span className="text-[15px] font-semibold text-ink-800 font-body">
                      Настройки семьи
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Выход */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border text-left active:scale-[0.99] transition"
              style={{
                borderColor: "var(--danger-border)",
                background: "var(--danger-bg-soft)",
              }}
            >
              <LogOut className="w-5 h-5 shrink-0 text-[color:var(--danger-fg-bold)]" strokeWidth={2.1} />
              <span className="text-[15px] font-semibold font-body text-[color:var(--danger-fg-bold)]">
                Выйти
              </span>
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          me={me}
          onClose={() => setShowSettings(false)}
          onUpdate={(m) => onMeUpdate(m)}
        />
      )}
    </>
  );
}
