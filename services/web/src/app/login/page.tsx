"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { House } from "lucide-react";
import { loginByPin, getMyFamilies } from "@/lib/api";
import PinInput from "@/components/PinInput";
import { PIN_BOXES, emptyPin, isValidPin, joinPin } from "@/lib/pin";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState(emptyPin());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError("Введи имя пользователя");
    const pinStr = joinPin(pin);
    if (!isValidPin(pinStr)) return setError("PIN — от 4 до 8 цифр");

    setError("");
    setLoading(true);
    try {
      await loginByPin(username.trim(), pinStr);
      const families = await getMyFamilies();
      if (families.length === 0) {
        router.push("/onboarding");
      } else {
        localStorage.setItem("familyId", families[0].family_id);
        router.push("/app");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Неверные данные");
      setPin(emptyPin());
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
                background: "rgb(var(--ink-900))",
                boxShadow:
                  "0 12px 36px var(--scrim-4), inset 0 1px 0 var(--highlight-1)",
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
                <PinInput value={pin} onChange={setPin} length={PIN_BOXES} />
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
          color: var(--text-tertiary);
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
            "radial-gradient(circle, rgb(var(--warm-200) / 0.85) 0%, rgb(var(--cream-300) / 0.45) 55%, transparent 100%)",
        }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-[420px] h-[420px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--warm-100) / 0.80) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-[32%] left-[58%] w-64 h-64 rounded-full opacity-35 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--warm-400) / 0.55) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
