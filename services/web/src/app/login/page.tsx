"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginByPin, getMyFamilies } from "@/lib/api";
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
      await loginByPin(username.trim(), pin.join(""));
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
          <h2 className="font-display text-2xl text-ink-900 mb-1">Войти</h2>
          <p className="text-ink-400 text-sm mb-8">Имя пользователя и PIN-код</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">
                Имя пользователя
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Мама"
                className="w-full px-4 py-3 rounded-2xl border-2 border-cream-200 bg-cream-50
                           text-ink-900 placeholder-ink-300 outline-none
                           focus:border-warm-400 focus:bg-white transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-3">
                PIN-код
              </label>
              <PinInput value={pin} onChange={setPin} />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center animate-fade-in">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-ink-900 text-cream-50 font-medium rounded-2xl
                         transition-all hover:bg-ink-700 active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Входим…" : "Войти"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-ink-400">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-warm-500 hover:underline">Создать</Link>
        </p>
      </div>
    </main>
  );
}