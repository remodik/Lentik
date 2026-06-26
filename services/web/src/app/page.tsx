import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  House,
  Images,
  MessageCircle,
  Users,
  Bell,
  Wallet,
  TreePine,
  ShieldCheck,
} from "lucide-react";
import EnterAppButton from "@/components/EnterAppButton";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: "Чаты в реальном времени",
    text: "Сообщения, голосовые, вложения, реакции и статусы прочтения — только для своих.",
  },
  {
    icon: Images,
    title: "Галерея и файлы",
    text: "Фото, видео и документы семьи в одном защищённом хранилище.",
  },
  {
    icon: CalendarDays,
    title: "Календарь и напоминания",
    text: "Общие события и личные напоминания, чтобы ничего не забыть.",
  },
  {
    icon: Wallet,
    title: "Бюджет",
    text: "Учёт расходов и балансы между участниками семьи.",
  },
  {
    icon: TreePine,
    title: "Семейное древо",
    text: "Стройте родословную с произвольным расположением узлов.",
  },
  {
    icon: ShieldCheck,
    title: "Роли и приватность",
    text: "Гибкие права доступа, журнал аудита и закрытое пространство.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Декоративный фон */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute -top-48 -right-48 w-[580px] h-[580px] rounded-full opacity-55 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgb(var(--warm-200) / 0.90) 0%, rgb(var(--cream-300) / 0.50) 55%, transparent 100%)",
          }}
        />
        <div
          className="absolute -bottom-36 -left-36 w-[440px] h-[440px] rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgb(var(--warm-100) / 0.85) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-5 py-10 sm:py-16">
        {/* Шапка */}
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-2xl glossy"
              style={{
                background: "rgb(var(--ink-900))",
                boxShadow: "0 8px 24px var(--scrim-4), inset 0 1px 0 var(--highlight-1)",
              }}
            >
              <House className="w-5 h-5 text-cream-50" strokeWidth={2.1} />
            </div>
            <span className="font-display text-2xl text-ink-900 tracking-tight">Lentik</span>
          </div>
          <EnterAppButton className="glass-button px-5 py-2.5 rounded-xl text-sm font-body text-ink-700" />
        </header>

        {/* Hero */}
        <section className="text-center max-w-2xl mx-auto mb-16 animate-fade-up">
          <h1 className="font-display text-4xl sm:text-6xl text-ink-900 tracking-tight leading-[1.05] mb-6">
            Приватное пространство
            <br />
            для вашей семьи
          </h1>
          <p className="text-ink-500 font-body text-lg sm:text-xl leading-relaxed mb-9">
            Lentik — закрытый семейный мессенджер: чаты, фото и видео, календарь,
            бюджет и семейное древо. Без посторонних, без рекламы — только близкие.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <EnterAppButton className="btn-primary px-8 py-4 rounded-2xl text-lg w-full sm:w-auto" />
            <Link
              href="/onboarding"
              className="glass-button px-8 py-4 rounded-2xl text-base font-body text-ink-700 w-full sm:w-auto text-center"
              data-testid="join-by-invite-btn"
            >
              Войти по приглашению
            </Link>
          </div>
          <p className="text-sm text-ink-300 font-body mt-5">
            Нет аккаунта?{" "}
            <Link
              href="/register"
              className="text-warm-500 hover:text-warm-600 font-medium transition-colors"
              data-testid="register-link"
            >
              Создать
            </Link>
          </p>
        </section>

        {/* Возможности */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {FEATURES.map(({ icon, title, text }) => {
            const Icon = icon;
            return (
              <div
                key={title}
                className="px-6 py-6 rounded-2xl glossy"
                style={{
                  background: "var(--bg-surface-subtle)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid var(--border-glass)",
                  boxShadow:
                    "0 2px 8px var(--scrim-faint), inset 0 1px 0 var(--bg-surface-strong)",
                }}
              >
                <Icon className="w-6 h-6 text-warm-500 mb-3" strokeWidth={2.1} />
                <h3 className="font-display text-lg text-ink-900 mb-1.5">{title}</h3>
                <p className="text-sm text-ink-500 font-body leading-snug">{text}</p>
              </div>
            );
          })}
        </section>

        {/* Финальный CTA */}
        <section className="text-center mb-10">
          <div className="flex flex-wrap items-center justify-center gap-2 text-ink-400 font-body text-sm mb-5">
            <Users className="w-4 h-4 text-warm-500" strokeWidth={2.1} />
            Несколько семей в одном аккаунте · присутствие онлайн · напоминания
            <Bell className="w-4 h-4 text-warm-500" strokeWidth={2.1} />
          </div>
          <EnterAppButton className="btn-primary px-10 py-4 rounded-2xl text-lg" />
        </section>

        <footer className="text-center text-xs text-ink-300 font-body pt-6">
          Lentik · семейный мессенджер
        </footer>
      </div>
    </main>
  );
}
