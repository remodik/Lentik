"use client";

import { useEffect, useRef, useState } from "react";
import { type Me } from "@/lib/api";

type Props = {
  me: Me;
  onClose: () => void;
  onUpdate: (updated: Me) => void;
};

type Category = "profile" | "security";

const CATEGORIES: { id: Category; icon: string; label: string }[] = [
  { id: "profile", icon: "👤", label: "Профиль" },
  { id: "security", icon: "🔑", label: "Безопасность" },
];

export default function SettingsModal({ me, onClose, onUpdate }: Props) {
  const [category, setCategory] = useState<Category>("profile");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex overflow-hidden"
        style={{ height: "560px" }}>

        <aside className="w-52 bg-cream-50 border-r border-cream-200 flex flex-col shrink-0">
          <div className="px-5 pt-5 pb-4 border-b border-cream-200">
            <p className="font-display text-lg text-ink-900">Настройки</p>
          </div>
          <nav className="p-2 space-y-0.5 flex-1">
            {CATEGORIES.map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setCategory(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all font-body ${
                  category === id
                    ? "bg-warm-100 text-ink-900 font-semibold"
                    : "text-ink-600 hover:bg-cream-100"
                }`}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {category === "profile" && (
            <ProfileSection me={me} onUpdate={onUpdate} />
          )}
          {category === "security" && (
            <SecuritySection />
          )}
        </main>
      </div>
    </div>
  );
}

function ProfileSection({ me, onUpdate }: { me: Me; onUpdate: (m: Me) => void }) {
  const [displayName, setDisplayName] = useState(me.display_name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");
  const [birthday, setBirthday] = useState(me.birthday ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUsernameChange(value: string) {
    setUsername(value);
    setUsernameTaken(false);
    setUsernameSuggestions([]);
    if (value === me.username) return;

    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (!value.trim()) return;

    checkTimeout.current = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (!data.available) {
          setUsernameTaken(true);
          setUsernameSuggestions(data.suggestions ?? []);
        }
      } finally { setCheckingUsername(false); }
    }, 500);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/me/avatar", {
        method: "POST", credentials: "include", body: form,
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      onUpdate(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setAvatarLoading(false); e.target.value = ""; }
  }

  async function handleSave() {
    if (usernameTaken) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || undefined,
          username: username !== me.username ? username.trim() : undefined,
          bio: bio.trim() || null,
          birthday: birthday || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail ?? "Ошибка");
      }
      onUpdate(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6">
      <h2 className="font-display text-xl text-ink-900 mb-6">Профиль</h2>

      <div className="flex items-center gap-5 mb-8 pb-8 border-b border-cream-100">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-full bg-warm-400 flex items-center justify-center text-white text-2xl font-bold font-display overflow-hidden">
            {me.avatar_url
              ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
              : me.display_name[0].toUpperCase()}
          </div>
          {avatarLoading && (
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarLoading}
            className="px-4 py-2 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                       hover:bg-ink-700 transition-colors disabled:opacity-50 font-body"
          >
            Сменить фото
          </button>
          <p className="text-xs text-ink-400 mt-1.5 font-body">JPG, PNG, WebP · до 5 МБ</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      </div>

      <div className="space-y-5">
        <Field label="Имя" hint="Видно всем в семье">
          <input value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="input-field" placeholder="Никита" />
        </Field>

        <Field label="Имя пользователя" hint="Только для входа">
          <div className="relative">
            <input
              value={username}
              onChange={e => handleUsernameChange(e.target.value)}
              className={`input-field pr-8 ${usernameTaken ? "border-red-300 focus:border-red-400" : ""}`}
              placeholder="nikita_325"
            />
            {checkingUsername && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-warm-300 border-t-warm-500 rounded-full animate-spin" />
              </div>
            )}
            {!checkingUsername && username && !usernameTaken && username !== me.username && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</div>
            )}
          </div>
          {usernameTaken && (
            <div className="mt-2">
              <p className="text-xs text-red-500 mb-1.5">Логин занят. Попробуй:</p>
              <div className="flex flex-wrap gap-1.5">
                {usernameSuggestions.map(s => (
                  <button key={s} type="button"
                    onClick={() => { setUsername(s); setUsernameTaken(false); setUsernameSuggestions([]); }}
                    className="px-2.5 py-1 bg-cream-100 border border-cream-200 text-ink-700 text-xs
                               rounded-lg hover:bg-warm-100 hover:border-warm-300 transition-colors font-body">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label="О себе" hint="До 300 символов">
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Расскажи немного о себе…"
            className="input-field resize-none"
          />
          <p className="text-xs text-ink-300 text-right mt-1 font-body">{bio.length}/300</p>
        </Field>

        <Field label="День рождения" hint="">
          <input
            type="date"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            className="input-field"
          />
        </Field>
      </div>

      {error && <p className="text-red-500 text-sm mt-4 font-body">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || usernameTaken}
          className="px-6 py-2.5 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                     hover:bg-ink-700 transition-colors disabled:opacity-50 font-body"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        {saved && <span className="text-sm text-green-600 font-body">✓ Сохранено</span>}
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
    if (next !== confirm) return setError("PIN не совпадает");
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/me/pin", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pin: current, new_pin: next }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail ?? "Ошибка");
      }
      setSaved(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6">
      <h2 className="font-display text-xl text-ink-900 mb-6">Безопасность</h2>

      <div className="space-y-4">
        {[
          { label: "Текущий PIN", value: current, set: setCurrent },
          { label: "Новый PIN", value: next, set: setNext },
          { label: "Повторить", value: confirm, set: setConfirm },
        ].map(({ label, value, set }) => (
          <Field key={label} label={label} hint="">
            <input
              type="password" inputMode="numeric" maxLength={4}
              value={value}
              onChange={e => set(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="input-field tracking-widest w-32"
            />
          </Field>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm mt-4 font-body">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || current.length !== 4 || next.length !== 4 || confirm.length !== 4}
          className="px-6 py-2.5 bg-ink-900 text-cream-50 text-sm font-medium rounded-xl
                     hover:bg-ink-700 transition-colors disabled:opacity-50 font-body"
        >
          {saving ? "Сохранение…" : "Сменить PIN"}
        </button>
        {saved && <span className="text-sm text-green-600 font-body">✓ Изменён</span>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-semibold text-ink-500 uppercase tracking-wider font-body">{label}</label>
        {hint && <span className="text-xs text-ink-300 font-body">{hint}</span>}
      </div>
      {children}
    </div>
  );
}