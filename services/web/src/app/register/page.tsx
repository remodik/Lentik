"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, House } from "lucide-react";
import { register } from "@/lib/api";
import PinInput from "@/components/PinInput";
import { apiFetch, setAuthToken } from "@/lib/api-base";

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
        const res = await apiFetch(
          `/auth/check-username?username=${encodeURIComponent(value.trim())}`,
        );
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
    if (pin.join("") !== confirm.join(""))
      return setError("PIN-коды не совпадают");

    setError("");
    setLoading(true);
    try {
      const auth = await register(displayName.trim(), username.trim(), pin.join(""));
      if (auth.access_token) setAuthToken(auth.access_token);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <Blobs />

      <div className="relative w-full max-w-sm animate-fade-up z-10 py-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-[20px] mb-4 glossy"
              style={{
                background: "#1c1714",
                boxShadow:
                  "0 12px 36px rgba(28,23,20,0.32), inset 0 1px 0 rgba(255,255,255,0.10)",
              }}
            >
              <House className="w-5 h-5 text-cream-50" strokeWidth={2.1} />
            </div>
            <h1 className="font-display text-4xl text-ink-900 tracking-tight leading-none">
              Lentik
            </h1>
          </Link>
          <p className="text-ink-400 mt-2 text-sm font-body">
            семейный мессенджер
          </p>
        </div>

        <div className="glass-page-card glossy p-8">
          <h2 className="font-display text-2xl text-ink-900 mb-1">
            Создать аккаунт
          </h2>
          <p className="text-ink-400 text-sm mb-7 font-body">
            Займёт меньше минуты
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="field-label">Твоё имя</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Например: Никита"
                className="glass-input mt-1.5"
                autoFocus
              />
              <p className="text-xs text-ink-400 mt-1.5 font-body">
                Будет видно всем в семье
              </p>
            </div>

            <div>
              <label className="field-label">Логин</label>
              <div className="relative mt-1.5">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="nikita_325"
                  className={`glass-input pr-9 ${nameTaken ? "!border-red-300 focus:!border-red-400" : ""}`}
                />
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-warm-300 border-t-warm-500 rounded-full animate-spin" />
                  </div>
                )}
                {!checking && username && !nameTaken && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                    <Check className="w-4 h-4" strokeWidth={2.8} />
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-400 mt-1.5 font-body">
                Только для входа, другие не видят
              </p>

              {nameTaken && (
                <div className="mt-2">
                  <p className="text-sm text-red-500 mb-2 font-body">
                    Логин занят. Попробуй:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setUsername(s);
                          setNameTaken(false);
                          setSuggestions([]);
                          setError("");
                        }}
                        className="glass-button px-3 py-1.5 text-sm rounded-xl font-body"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="field-label">Придумай PIN-код</label>
              <div className="mt-3">
                <PinInput value={pin} onChange={setPin} />
              </div>
            </div>

            <div>
              <label className="field-label">Повтори PIN-код</label>
              <div className="mt-3">
                <PinInput value={confirm} onChange={setConfirm} />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center animate-fade-in font-body">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || nameTaken || checking}
              className="btn-primary w-full py-[14px] rounded-2xl text-[0.9375rem]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Создаём…
                </span>
              ) : (
                "Создать аккаунт"
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-sm text-ink-400 font-body">
          Уже есть аккаунт?{" "}
          <Link
            href="/login"
            className="text-warm-500 hover:text-warm-600 font-medium transition-colors"
          >
            Войти
          </Link>
        </p>
      </div>

      <style jsx global>{`
        .field-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b5a4e;
          font-family: "DM Sans", sans-serif;
        }
      `}</style>
    </main>
  );
}

function Blobs() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <div
        className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(245,213,176,0.85) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-55 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(250,235,215,0.85) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-[40%] left-[60%] w-56 h-56 rounded-full opacity-30 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(196,149,106,0.5) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
