"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import PinInput from "@/components/PinInput";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirm, setConfirm] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError("Введи имя пользователя");
    if (pin.some((d) => !d)) return setError("Введи PIN-код");
    if (pin.join("") !== confirm.join("")) return setError("PIN-коды не совпадают");

    setError("");
    setLoading(true);
    try {
      await register(username.trim(), pin.join(""));
      router.push("/onboarding");
    } catch (err: unknown) {
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

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">
                Имя пользователя
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Например: Мама или Никита"
                className="w-full px-4 py-3 rounded-2xl border-2 border-cream-200 bg-cream-50
                           text-ink-900 placeholder-ink-300 outline-none
                           focus:border-warm-400 focus:bg-white transition-all"
                autoFocus
              />
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