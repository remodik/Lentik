"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import PinInput from "@/components/PinInput";

export default function RegisterPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirm, setConfirm] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [checking, setChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [nameTaken, setNameTaken] = useState(false);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    const suggested = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (suggested) setUsername(suggested);
  }

  function handleUsernameChange(value: string) {
    setUsername(value);
    setNameTaken(false);
    setSuggestions([]);
    setError("");

    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (!value.trim()) return;

    checkTimeout.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (!data.available) {
          setNameTaken(true);
          setSuggestions(data.suggestions ?? []);
        }
      } finally {
        setChecking(false);
      }
    }, 500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return setError("Введи своё имя");
    if (!username.trim()) return setError("Введи логин");
    if (nameTaken) return setError("Этот логин занят — выбери другой");
    if (pin.some((d) => !d)) return setError("Введи PIN-код");
    if (pin.join("") !== confirm.join("")) return setError("PIN-коды не совпадают");

    setError("");
    setLoading(true);
    try {
      await register(displayName.trim(), username.trim(), pin.join(""));
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cream-200 opacity-60" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-cream-100" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="text-center mb-10">
          <Link href="/" className="font-display text-4xl text-ink-900 tracking-tight">Lentik</Link>
          <p className="text-ink-400 mt-1 text-sm">семейный мессенджер</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-cream-200 p-8">
          <h2 className="font-display text-2xl text-ink-900 mb-1">Создать аккаунт</h2>
          <p className="text-ink-400 text-sm mb-8">Займёт меньше минуты</p>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">
                Твоё имя
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Например: Никита"
                className="w-full px-4 py-3 rounded-2xl border-2 border-cream-200 bg-cream-50
                           text-ink-900 placeholder-ink-300 outline-none
                           focus:border-warm-400 focus:bg-white transition-all"
                autoFocus
              />
              <p className="text-xs text-ink-300 mt-1.5 font-body">Будет видно всем в семье</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">
                Логин
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="nikita_325"
                  className={`w-full px-4 py-3 rounded-2xl border-2 bg-cream-50
                             text-ink-900 placeholder-ink-300 outline-none transition-all
                             ${nameTaken
                               ? "border-red-300 focus:border-red-400"
                               : "border-cream-200 focus:border-warm-400 focus:bg-white"
                             }`}
                />
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-warm-300 border-t-warm-500 rounded-full animate-spin" />
                  </div>
                )}
                {!checking && username && !nameTaken && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</div>
                )}
              </div>
              <p className="text-xs text-ink-300 mt-1.5 font-body">Только для входа, другие не видят</p>

              {nameTaken && (
                <div className="mt-2">
                  <p className="text-sm text-red-500 mb-2">Логин занят. Попробуй:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button key={s} type="button"
                        onClick={() => { setUsername(s); setNameTaken(false); setSuggestions([]); setError(""); }}
                        className="px-3 py-1.5 bg-cream-100 border border-cream-200 text-ink-700 text-sm
                                   rounded-xl hover:bg-warm-100 hover:border-warm-300 transition-colors font-body">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-3">
                Придумай PIN-код
              </label>
              <PinInput value={pin} onChange={setPin} />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-3">
                Повтори PIN-код
              </label>
              <PinInput value={confirm} onChange={setConfirm} />
            </div>

            {error && <p className="text-red-500 text-sm text-center animate-fade-in">{error}</p>}

            <button type="submit" disabled={loading || nameTaken || checking}
              className="w-full py-3.5 bg-ink-900 text-cream-50 font-medium rounded-2xl
                         transition-all hover:bg-ink-700 active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Создаём…" : "Создать аккаунт"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-ink-400">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-warm-500 hover:underline">Войти</Link>
        </p>
      </div>
    </main>
  );
}