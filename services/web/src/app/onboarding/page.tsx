"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { House } from "lucide-react";
import {
  buildFamilyInviteLink,
  createFamily,
  createInvite,
  getMyFamilies,
  joinByInvite,
} from "@/lib/api";
import { setAuthToken } from "@/lib/api-base";
import SubscriptionModal from "@/components/SubscriptionModal";
import { FREE_FAMILY_LIMIT, isFamilyLimitError } from "@/lib/families";
import PinInput from "@/components/PinInput";
import { PartyPopper, ArrowLeft, Link2, HousePlus, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api-base";

function Blobs() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,213,176,0.85) 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-55 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(250,235,215,0.85) 0%, transparent 70%)" }}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-button px-4 py-2 rounded-xl text-base mb-6 font-body flex items-center gap-2"
      data-testid="onboarding-back-btn"
    >
      <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
      Назад
    </button>
  );
}

type Step = "choice" | "create" | "join";

function OnboardingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("token");

  // If token is present — go directly to join step
  const [step, setStep] = useState<Step>(inviteToken ? "join" : "choice");
  const [familyName, setFamilyName] = useState("");
  const [token, setToken] = useState(inviteToken ?? "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [familyCount, setFamilyCount] = useState(0);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  useEffect(() => {
    void loadFamiliesCount();
  }, []);

  async function loadFamiliesCount() {
    try {
      const families = await getMyFamilies();
      setFamilyCount(families.length);
    } catch {}
  }

  // ── Create family ────────────────────────────────────────────────
  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!familyName.trim()) return setError("Введи название семьи");
    if (familyCount >= FREE_FAMILY_LIMIT) {
      setShowSubscriptionModal(true);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const family = await createFamily(familyName.trim());
      localStorage.setItem("familyId", family.id);
      setFamilyCount((prev) => prev + 1);
      const invite = await createInvite(family.id);
      setInviteLink(buildFamilyInviteLink(invite.token));
    } catch (err: unknown) {
      if (isFamilyLimitError(err)) {
        setShowSubscriptionModal(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  // ── Join by invite (with name + PIN) ─────────────────────────────
  async function handleJoinByInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return setError("Вставь ссылку или код приглашения");
    if (!displayName.trim()) return setError("Введи своё имя");
    if (pin.some((d) => !d)) return setError("Введи 4-значный PIN-код");

    setError("");
    setLoading(true);

    try {
      let t = token.trim();
      // Extract token from URL if full link was pasted
      try {
        const url = new URL(t);
        t = url.searchParams.get("token") ?? t;
      } catch {}

      const pinStr = pin.join("");
      const result = await joinByInvite(t, displayName.trim(), pinStr);

      // Store session
      if (result.family_id) localStorage.setItem("familyId", result.family_id);
      if (result.user_id) localStorage.setItem("userId", result.user_id);

      // Store access token if returned
      if (result.access_token) {
        setAuthToken(result.access_token);
      }

      router.push("/app");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка. Проверь код приглашения");
      setPin(["", "", "", ""]);
    } finally {
      setLoading(false);
    }
  }

  // ── Family created success screen ────────────────────────────────
  if (inviteLink) {
    return (
      <>
        <div className="glass-page-card glossy p-8 text-center">
          <div className="w-16 h-16 rounded-[22px] mx-auto mb-4 flex items-center justify-center glossy"
            style={{
              background: "rgba(255,255,255,0.60)",
              border: "1px solid rgba(255,255,255,0.55)",
              boxShadow: "0 8px 24px rgba(28,23,20,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
            }}
          >
            <PartyPopper className="w-8 h-8 text-warm-500" strokeWidth={1.9} />
          </div>
          <h2 className="font-display text-2xl text-ink-900 mb-2">Семья создана!</h2>
          <p className="text-ink-400 text-base mb-6 font-body">
            Отправь эту ссылку членам семьи
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(inviteLink);
              alert("Ссылка скопирована!");
            }}
            className="w-full text-left p-4 rounded-2xl text-sm font-body text-ink-700 break-all transition-all active:scale-[0.99]"
            style={{
              background: "rgba(255,255,255,0.48)",
              border: "1px solid rgba(255,255,255,0.50)",
              backdropFilter: "blur(12px)",
            }}
            data-testid="copy-invite-link-btn"
          >
            {inviteLink}
          </button>
          <p className="text-xs text-ink-400 mt-2 mb-6 font-body">Нажми чтобы скопировать</p>
          <button
            onClick={() => router.push("/app")}
            className="btn-primary w-full py-4 rounded-2xl text-base inline-flex items-center justify-center gap-2"
            data-testid="go-to-app-btn"
          >
            Открыть приложение
            <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>
        <SubscriptionModal open={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />
      </>
    );
  }

  // ── Choice step ──────────────────────────────────────────────────
  if (step === "choice") {
    return (
      <>
        <div className="glass-page-card glossy p-8">
          <h2 className="font-display text-2xl text-ink-900 mb-2 mobile-elderly-title">
            Добро пожаловать!
          </h2>
          <p className="text-ink-400 text-base mb-8 font-body">
            Создай семью или войди по приглашению
          </p>

          <div className="space-y-4">
            <button
              onClick={() => setStep("join")}
              className="w-full py-5 px-5 text-left rounded-2xl transition-all active:scale-[0.98]"
              style={{
                background: "#1c1714",
                boxShadow: "0 6px 20px rgba(28,23,20,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
              data-testid="choice-join-btn"
            >
              <div className="font-medium text-cream-50 font-body inline-flex items-center gap-2 text-base">
                <Link2 className="w-5 h-5" strokeWidth={2.1} />
                Войти по приглашению
              </div>
              <div className="text-sm text-cream-200/70 mt-1 font-body">
                Есть ссылка от члена семьи
              </div>
            </button>

            <button
              onClick={() => setStep("create")}
              className="w-full py-5 px-5 text-left rounded-2xl transition-all active:scale-[0.98] glass-button"
              style={{ borderRadius: "1rem" }}
              data-testid="choice-create-btn"
            >
              <div className="font-medium text-ink-800 font-body inline-flex items-center gap-2 text-base">
                <HousePlus className="w-5 h-5" strokeWidth={2.1} />
                Создать семью
              </div>
              <div className="text-sm text-ink-400 mt-1 font-body">
                Стать администратором
              </div>
            </button>
          </div>
        </div>
        <SubscriptionModal open={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />
      </>
    );
  }

  // ── Create family step ───────────────────────────────────────────
  if (step === "create") {
    return (
      <>
        <div className="glass-page-card glossy p-8">
          <BackButton onClick={() => setStep("choice")} />
          <h2 className="font-display text-2xl text-ink-900 mb-2 mobile-elderly-title">Создать семью</h2>
          <p className="text-ink-400 text-base mb-6 font-body">Как называется ваша семья?</p>

          <form onSubmit={handleCreateFamily} className="space-y-5">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Например: Семья Ивановых"
              className="glass-input"
              autoFocus
              data-testid="family-name-input"
            />
            {error && (
              <p className="text-red-500 text-base text-center font-body">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-4 rounded-2xl text-base"
              data-testid="create-family-submit-btn"
            >
              {loading ? "Создаём…" : "Создать семью"}
            </button>
          </form>
        </div>
        <SubscriptionModal open={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />
      </>
    );
  }

  // ── Join by invite step ──────────────────────────────────────────
  return (
    <>
      <div className="glass-page-card glossy p-8">
        {!inviteToken && <BackButton onClick={() => setStep("choice")} />}

        <h2 className="font-display text-2xl text-ink-900 mb-2 mobile-elderly-title">
          Войти в семью
        </h2>
        <p className="text-ink-400 text-base mb-7 font-body">
          Введите данные для входа
        </p>

        <form onSubmit={handleJoinByInvite} className="space-y-6">
          {/* Token field */}
          <div>
            <label className="mobile-elderly-label block text-sm font-semibold text-ink-500 mb-2 font-body">
              Код приглашения
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Вставьте ссылку или код"
              className="glass-input"
              autoFocus={!inviteToken}
              data-testid="invite-token-input"
            />
            {inviteToken && (
              <p className="text-xs text-warm-500 mt-1.5 font-body">
                Код приглашения получен
              </p>
            )}
          </div>

          {/* Display name field */}
          <div>
            <label className="mobile-elderly-label block text-sm font-semibold text-ink-500 mb-2 font-body">
              Ваше имя
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Например: Бабушка Люда"
              className="glass-input"
              autoComplete="name"
              data-testid="display-name-input"
            />
            <p className="text-xs text-ink-400 mt-1.5 font-body">
              Так вас увидят другие члены семьи
            </p>
          </div>

          {/* PIN field */}
          <div>
            <label className="mobile-elderly-label block text-sm font-semibold text-ink-500 mb-3 font-body">
              Придумайте 4-значный PIN-код
            </label>
            <PinInput value={pin} onChange={setPin} />
            <p className="text-xs text-ink-400 mt-3 text-center font-body">
              Запомните PIN — он нужен для входа
            </p>
          </div>

          {error && (
            <p className="text-red-500 text-base text-center animate-fade-in font-body" data-testid="join-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 rounded-2xl text-base"
            data-testid="join-submit-btn"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Входим…
              </span>
            ) : (
              "Присоединиться к семье"
            )}
          </button>
        </form>
      </div>
      <SubscriptionModal open={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <Blobs />

      <div className="relative w-full max-w-sm animate-fade-up z-10">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-[22px] mb-5 glossy"
            style={{
              background: "#1c1714",
              boxShadow: "0 12px 36px rgba(28,23,20,0.32), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <House className="w-7 h-7 text-cream-50" strokeWidth={2.1} />
          </div>
          <h1 className="font-display text-5xl text-ink-900 tracking-tight leading-none mb-2">
            Lentik
          </h1>
          <p className="text-ink-400 text-base font-body">семейный альбом</p>
        </div>

        <Suspense>
          <OnboardingContent />
        </Suspense>
      </div>
    </main>
  );
}
