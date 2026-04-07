import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, House, Images, MessageCircle, Users } from "lucide-react";

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: Images, text: "Фото и видео только для вашей семьи" },
  { icon: MessageCircle, text: "Приватный чат без посторонних" },
  { icon: Users, text: "Все члены семьи в одном месте" },
  { icon: CalendarDays, text: "Общий семейный календарь" },
];

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div
          className="absolute -top-48 -right-48 w-[580px] h-[580px] rounded-full opacity-55 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(245,213,176,0.90) 0%, rgba(232,213,184,0.50) 55%, transparent 100%)",
          }}
        />
        <div
          className="absolute -bottom-36 -left-36 w-[440px] h-[440px] rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(250,235,215,0.85) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[380px] animate-fade-up z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-[26px] mb-5 glossy"
            style={{
              background: "#1c1714",
              boxShadow:
                "0 14px 40px rgba(28,23,20,0.30), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <House className="w-9 h-9 text-cream-50" strokeWidth={2.1} />
          </div>
          <h1 className="font-display text-5xl text-ink-900 tracking-tight leading-none mb-3">
            Lentik
          </h1>
          <p className="text-ink-400 font-body text-lg">
            Семейный альбом и чат
          </p>
        </div>

        {/* Primary CTA — join by invite */}
        <div className="space-y-4 mb-8">
          <Link
            href="/onboarding"
            className="btn-primary block w-full py-5 rounded-2xl text-center text-lg"
            data-testid="join-by-invite-btn"
          >
            Войти по приглашению
          </Link>
          <Link
            href="/login"
            className="glass-button block w-full py-4 rounded-2xl text-center text-base font-body text-ink-700"
            data-testid="login-btn"
          >
            У меня уже есть аккаунт
          </Link>
        </div>

        {/* Feature list */}
        <div className="space-y-3 mb-6">
          {FEATURES.map(({ icon, text }) => {
            const Icon = icon;
            return (
              <div
                key={text}
                className="flex items-center gap-4 px-5 py-4 rounded-2xl glossy"
                style={{
                  background: "rgba(255,255,255,0.48)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.52)",
                  boxShadow:
                    "0 2px 8px rgba(28,23,20,0.05), inset 0 1px 0 rgba(255,255,255,0.72)",
                }}
              >
                <Icon className="w-5 h-5 shrink-0 text-warm-500" strokeWidth={2.1} />
                <span className="text-sm text-ink-600 font-body leading-snug">{text}</span>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-ink-300 font-body">
          Нет аккаунта?{" "}
          <Link
            href="/register"
            className="text-warm-500 hover:text-warm-600 font-medium transition-colors"
            data-testid="register-link"
          >
            Создать
          </Link>
        </p>
      </div>
    </main>
  );
}
