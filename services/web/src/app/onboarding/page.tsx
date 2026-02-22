"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createFamily, createInvite, getMyFamilies } from "@/lib/api";

type Step = "choice" | "create" | "join";

function OnboardingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("token");

  const [step, setStep] = useState<Step>(inviteToken ? "join" : "choice");
  const [familyName, setFamilyName] = useState("");
  const [token, setToken] = useState(inviteToken ?? "");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!familyName.trim()) return setError("Введи название семьи");

    setError("");
    setLoading(true);
    try {
      const family = await createFamily(familyName.trim());
      localStorage.setItem("familyId", family.id);

      const invite = await createInvite(family.id);
      setInviteLink(invite.join_url.replace("http://localhost:8000", "http://localhost:3000").replace("/join?", "/join?"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinByInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return setError("Вставь ссылку-приглашение");

    setError("");
    setLoading(true);
    try {
      // Извлекаем токен из ссылки если вставили полную ссылку
      let t = token.trim();
      try {
        const url = new URL(t);
        t = url.searchParams.get("token") ?? t;
      } catch {
        // уже просто токен
      }

      // Присоединяемся к семье через уже существующий аккаунт
      const res = await fetch("/api/families/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Ошибка" }));
        throw new Error(err.detail);
      }

      const data = await res.json();
      localStorage.setItem("familyId", data.family_id);
      router.push("/app");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function goToApp() {
    router.push("/app");
  }

  // ── Семья создана — показываем инвайт-ссылку ──────────────────
  if (inviteLink) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-cream-200 p-8 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="font-display text-2xl text-ink-900 mb-2">Семья создана!</h2>
        <p className="text-ink-400 text-sm mb-6">
          Пригласи остальных — отправь им эту ссылку
        </p>

        <div
          className="bg-cream-50 border border-cream-200 rounded-2xl px-4 py-3 text-sm text-ink-700
                     font-body break-all cursor-pointer hover:bg-cream-100 transition-all"
          onClick={() => {
            navigator.clipboard.writeText(inviteLink);
            alert("Ссылка скопирована!");
          }}
        >
          {inviteLink}
        </div>
        <p className="text-xs text-ink-300 mt-2">Нажми чтобы скопировать</p>

        <button
          onClick={goToApp}
          className="mt-6 w-full py-3.5 bg-ink-900 text-cream-50 font-medium rounded-2xl
                     hover:bg-ink-700 transition-all active:scale-[0.98]"
        >
          Перейти в мессенджер →
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Выбор ─────────────────────────────────────────────── */}
      {step === "choice" && (
        <div className="bg-white rounded-3xl shadow-sm border border-cream-200 p-8">
          <h2 className="font-display text-2xl text-ink-900 mb-1">Добро пожаловать!</h2>
          <p className="text-ink-400 text-sm mb-8">
            Создай новую семью или присоединись по приглашению
          </p>

          <div className="space-y-3">
            <button
              onClick={() => setStep("create")}
              className="w-full py-4 px-5 bg-ink-900 text-cream-50 rounded-2xl text-left
                         hover:bg-ink-700 transition-all active:scale-[0.98]"
            >
              <div className="font-medium">🏠 Создать семью</div>
              <div className="text-xs text-cream-200 mt-0.5">Ты станешь администратором</div>
            </button>

            <button
              onClick={() => setStep("join")}
              className="w-full py-4 px-5 bg-white border-2 border-cream-200 text-ink-700 rounded-2xl text-left
                         hover:border-warm-400 transition-all active:scale-[0.98]"
            >
              <div className="font-medium">🔗 Войти по приглашению</div>
              <div className="text-xs text-ink-400 mt-0.5">У тебя есть ссылка от кого-то из семьи</div>
            </button>
          </div>
        </div>
      )}

      {/* ── Создать семью ──────────────────────────────────────── */}
      {step === "create" && (
        <div className="bg-white rounded-3xl shadow-sm border border-cream-200 p-8">
          <button
            onClick={() => setStep("choice")}
            className="text-ink-400 text-sm mb-6 hover:text-ink-700 transition-colors"
          >
            ← Назад
          </button>

          <h2 className="font-display text-2xl text-ink-900 mb-1">Создать семью</h2>
          <p className="text-ink-400 text-sm mb-8">Как называется твоя семья?</p>

          <form onSubmit={handleCreateFamily} className="space-y-6">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Например: Семья Ивановых"
              className="w-full px-4 py-3 rounded-2xl border-2 border-cream-200 bg-cream-50
                         text-ink-900 placeholder-ink-300 outline-none
                         focus:border-warm-400 focus:bg-white transition-all"
              autoFocus
            />

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-ink-900 text-cream-50 font-medium rounded-2xl
                         hover:bg-ink-700 transition-all active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Создаём…" : "Создать"}
            </button>
          </form>
        </div>
      )}

      {/* ── Войти по инвайту ───────────────────────────────────── */}
      {step === "join" && (
        <div className="bg-white rounded-3xl shadow-sm border border-cream-200 p-8">
          <button
            onClick={() => setStep("choice")}
            className="text-ink-400 text-sm mb-6 hover:text-ink-700 transition-colors"
          >
            ← Назад
          </button>

          <h2 className="font-display text-2xl text-ink-900 mb-1">Войти по приглашению</h2>
          <p className="text-ink-400 text-sm mb-8">Вставь ссылку или токен от члена семьи</p>

          <form onSubmit={handleJoinByInvite} className="space-y-6">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="https://... или токен"
              className="w-full px-4 py-3 rounded-2xl border-2 border-cream-200 bg-cream-50
                         text-ink-900 placeholder-ink-300 outline-none
                         focus:border-warm-400 focus:bg-white transition-all"
              autoFocus
            />

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-ink-900 text-cream-50 font-medium rounded-2xl
                         hover:bg-ink-700 transition-all active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Подключаемся…" : "Присоединиться"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cream-200 opacity-60" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-cream-100" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl text-ink-900 tracking-tight">Lentik</h1>
          <p className="text-ink-400 mt-1 text-sm">семейный мессенджер</p>
        </div>

        <Suspense>
          <OnboardingContent />
        </Suspense>
      </div>
    </main>
  );
}