"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Check, Palette, Shield, User, X } from "lucide-react";
import { type Me } from "@/lib/api";
import { apiFetch, normalizeApiPayload } from "@/lib/api-base";
import { ThemeSelector } from "@/components/ThemeSelector";

type Props = {
  me: Me;
  onClose: () => void;
  onUpdate: (updated: Me) => void;
};

type Category = "profile" | "security" | "appearance";

const CATEGORIES: { id: Category; icon: LucideIcon; label: string }[] = [
  { id: "profile", icon: User, label: "Профиль" },
  { id: "security", icon: Shield, label: "Безопасность" },
  { id: "appearance", icon: Palette, label: "Оформление" },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="settings-field-label">
          {label}
        </label>
        {hint && (
          <span className="settings-field-hint">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ProfileSection({
  me,
  onUpdate,
}: {
  me: Me;
  onUpdate: (m: Me) => void;
}) {
  const [displayName, setDisplayName] = useState(me.display_name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");
  const [birthday, setBirthday] = useState(me.birthday ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [avatarLoading, setAvatarLoading] = useState(false);

  const [checkingUsername, setChecking] = useState(false);
  const [usernameTaken, setTaken] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current);
    };
  }, []);

  function handleUsernameChange(value: string) {
    setUsername(value);
    setTaken(false);
    setSuggestions([]);

    if (value === me.username) return;
    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (!value.trim()) return;

    checkTimeout.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await apiFetch(
          `/auth/check-username?username=${encodeURIComponent(value.trim())}`,
        );
        const data = await res.json().catch(() => ({}) as any);
        if (!data.available) {
          setTaken(true);
          setSuggestions(data.suggestions ?? []);
        }
      } finally {
        setChecking(false);
      }
    }, 500);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarLoading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await apiFetch("/me/avatar", {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error("Ошибка загрузки");
      onUpdate(normalizeApiPayload<Me>(await res.json()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAvatarLoading(false);
      e.target.value = "";
    }
  }

  async function handleSave() {
    if (usernameTaken) return;

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await apiFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: displayName.trim() || undefined,
          username: username !== me.username ? username.trim() : undefined,
          bio: bio.trim() || null,
          birthday: birthday || null,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).detail ?? "Ошибка");
      }

      onUpdate(normalizeApiPayload<Me>(await res.json()));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const initial = me.display_name[0]?.toUpperCase() ?? "?";

  return (
    <div className="p-6 overflow-y-auto h-full sidebar-scroll">
      <h2 className="font-display text-xl text-ink-900 mb-6 leading-tight">
        Профиль
      </h2>

      <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap mb-7 pb-7 border-b border-white/35">
        <div className="relative shrink-0">
          <div
            className="settings-avatar-lg"
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

          {avatarLoading && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="min-w-[180px]">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarLoading}
            className="ui-btn ui-btn-primary disabled:opacity-50"
            type="button"
          >
            Сменить фото
          </button>
          <p className="text-[11px] text-ink-400 mt-2 font-body">
            JPG, PNG, WebP · до 5 МБ
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarUpload}
        />
      </div>

      <div className="space-y-5">
        <Field label="Имя" hint="Видно всем в семье">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-field"
            placeholder="Никита"
          />
        </Field>

        <Field label="Логин" hint="Только для входа">
          <div className="relative">
            <input
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              className={`input-field pr-10 ${usernameTaken ? "!border-red-300" : ""}`}
              placeholder="nikita_325"
            />
            {checkingUsername && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-warm-300 border-t-warm-500 rounded-full animate-spin" />
              </div>
            )}
            {!checkingUsername &&
              username &&
              !usernameTaken &&
              username !== me.username && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm font-bold">
                  ✓
                </span>
              )}
          </div>

          {usernameTaken && (
            <div className="mt-2">
              <p className="text-xs text-red-500 mb-1.5 font-body">
                Логин занят. Попробуй:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setUsername(s);
                      setTaken(false);
                      setSuggestions([]);
                    }}
                    className="ui-chip ui-chip-action"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label="О себе" hint="до 300 символов">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Расскажи о себе…"
            className="input-field resize-none"
          />
          <p className="text-[11px] text-ink-300 text-right mt-1 font-body">
            {bio.length}/300
          </p>
        </Field>

        <Field label="День рождения">
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="input-field"
          />
        </Field>
      </div>

      {error && (
        <p className="text-red-500 text-sm mt-4 font-body animate-fade-in">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || usernameTaken || checkingUsername}
          className="ui-btn ui-btn-primary"
          type="button"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Сохранение…
            </span>
          ) : (
            "Сохранить"
          )}
        </button>

        {saved && (
          <span className="text-sm text-green-600 font-body animate-fade-in flex items-center gap-1.5">
            <Check className="w-4 h-4" strokeWidth={2.5} />
            Сохранено
          </span>
        )}
      </div>
    </div>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (next.length !== 4) return setError("PIN должен быть 4 цифры");
    if (next !== confirm) return setError("PIN-коды не совпадают");

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await apiFetch("/me/pin", {
        method: "PATCH",
        body: JSON.stringify({ current_pin: current, new_pin: next }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).detail ?? "Ошибка");
      }

      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: "Текущий PIN", value: current, set: setCurrent },
    { label: "Новый PIN", value: next, set: setNext },
    { label: "Повторить PIN", value: confirm, set: setConfirm },
  ] as const;

  return (
    <div className="p-6 overflow-y-auto h-full sidebar-scroll">
      <h2 className="font-display text-xl text-ink-900 mb-2 leading-tight">
        Безопасность
      </h2>
      <p className="text-sm text-ink-400 font-body mb-6">
        Смена PIN-кода для входа
      </p>

      <div className="space-y-4 max-w-xs">
        {fields.map(({ label, value, set }) => (
          <Field key={label} label={label}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={value}
              onChange={(e) =>
                set(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="••••"
              className="input-field tracking-[0.4em] text-center w-36 text-lg font-semibold"
            />
          </Field>
        ))}
      </div>

      {error && (
        <p className="text-red-500 text-sm mt-4 font-body animate-fade-in">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={
            saving ||
            current.length !== 4 ||
            next.length !== 4 ||
            confirm.length !== 4
          }
          className="ui-btn ui-btn-primary"
          type="button"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Смена…
            </span>
          ) : (
            "Сменить PIN"
          )}
        </button>

        {saved && (
          <span className="text-sm text-green-600 font-body animate-fade-in flex items-center gap-1.5">
            <Check className="w-4 h-4" strokeWidth={2.5} />
            PIN изменён
          </span>
        )}
      </div>
    </div>
  );
}

function AppearanceSection() {
  return (
    <div className="p-6 overflow-y-auto h-full sidebar-scroll">
      <ThemeSelector />
    </div>
  );
}

export default function SettingsModal({ me, onClose, onUpdate }: Props) {
  const [category, setCategory] = useState<Category>("profile");
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const content = (
    <div
      ref={overlayRef}
      className="settings-modal-overlay"
      onClick={(e) => e.target === overlayRef.current && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Настройки"
    >
      <div className="settings-modal-panel">
        <header className="settings-modal-head">
          <div className="min-w-0">
            <p className="font-display text-lg text-ink-900 leading-tight">
              Настройки
            </p>
            <p className="text-[11px] text-ink-400 font-body mt-0.5">
              Семейный профиль
            </p>
          </div>

          <button
            onClick={onClose}
            className="ui-btn ui-btn-icon"
            type="button"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </header>

        <div className="settings-modal-body">
          <aside className="settings-modal-sidebar">
            <nav className="p-2.5 space-y-0.5 flex-1">
            {CATEGORIES.map(({ id, icon, label }) => {
              const active = category === id;
              const Icon = icon;
              return (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  className={`settings-nav-item ${active ? "active" : ""}`}
                  type="button"
                >
                  <span
                    className={`settings-nav-icon ${active ? "active" : ""}`}
                    aria-hidden
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.2} />
                  </span>
                  {label}
                </button>
              );
            })}
            </nav>

            <div className="p-4 flex items-center gap-3 border-t border-white/35">
              <div className="settings-avatar-sm" aria-hidden>
                {me.avatar_url ? (
                  <img
                    src={me.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (me.display_name[0]?.toUpperCase() ?? "?")
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-700 font-body truncate leading-tight">
                  {me.display_name}
                </p>
                <p className="text-[11px] text-ink-400 font-body">
                  @{me.username}
                </p>
              </div>
            </div>
          </aside>

          <main className="flex-1 overflow-hidden">
            {category === "profile" && (
              <ProfileSection me={me} onUpdate={onUpdate} />
            )}
            {category === "security" && <SecuritySection />}
            {category === "appearance" && <AppearanceSection />}
          </main>
        </div>

        <footer className="settings-modal-foot">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-subtle"
            type="button"
          >
            Закрыть
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
