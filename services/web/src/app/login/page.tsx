"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { House } from "lucide-react";
import { loginByPin, getMyFamilies } from "@/lib/api";
import { setAuthToken } from "@/lib/api-base";
import PinInput from "@/components/PinInput";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError("Введи имя пользователя");
    if (pin.some((d) => !d)) return setError("Введи PIN");

    setError("");
    setLoading(true);
    try {
      const auth = await loginByPin(username.trim(), pin.join(""));
      if (auth.access_token) setAuthToken(auth.access_token);
      const families = await getMyFamilies();
      if (families.length === 0) {
        router.push("/onboarding");
      } else {
        localStorage.setItem("familyId", families[0].family_id);
        router.push("/app");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Неверные данные");
      setPin(["", "", "", ""]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <Blobs />

      <div className="relative w-full max-w-sm animate-fade-up z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block group">
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
            <h1 className="font-display text-4xl text-ink-900 tracking-tight leading-none group-hover:text-ink-700 transition-colors">
              Lentik
            </h1>
          </Link>
          <p className="text-ink-400 mt-2 text-sm font-body">
            семейный мессенджер
          </p>
        </div>

        <div className="glass-page-card glossy p-8">
          <h2 className="font-display text-[1.625rem] text-ink-900 mb-1 leading-tight">
            Добро пожаловать
          </h2>
          <p className="text-ink-400 text-sm mb-7 font-body">
            Введи свой логин и PIN-код
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="field-label">Имя пользователя</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введи логин"
                className="glass-input mt-1.5"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="field-label">PIN-код</label>
              <div className="mt-3">
                <PinInput value={pin} onChange={setPin} />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center animate-fade-in font-body">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-[14px] rounded-2xl text-[0.9375rem]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Входим…
                </span>
              ) : (
                "Войти"
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-sm text-ink-400 font-body">
          Нет аккаунта?{" "}
          <Link
            href="/register"
            className="text-warm-500 hover:text-warm-600 font-medium transition-colors"
          >
            Создать
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
        className="absolute -top-48 -right-48 w-[560px] h-[560px] rounded-full opacity-55 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(245,213,176,0.85) 0%, rgba(232,213,184,0.45) 55%, transparent 100%)",
        }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-[420px] h-[420px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(250,235,215,0.80) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-[32%] left-[58%] w-64 h-64 rounded-full opacity-35 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(196,149,106,0.55) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
