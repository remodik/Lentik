import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cream-200 opacity-60" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-cream-100" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up text-center">
        <h1 className="font-display text-5xl text-ink-900 tracking-tight mb-2">Lentik</h1>
        <p className="text-ink-400 font-body mb-12">семейный мессенджер</p>

        <div className="space-y-3">
          <Link
            href="/register"
            className="block w-full py-4 bg-ink-900 text-cream-50 font-body font-medium
                       rounded-2xl transition-all hover:bg-ink-700 active:scale-[0.98] text-center"
          >
            Создать аккаунт
          </Link>
          <Link
            href="/login"
            className="block w-full py-4 bg-white border-2 border-cream-200 text-ink-700 font-body font-medium
                       rounded-2xl transition-all hover:border-warm-400 active:scale-[0.98] text-center"
          >
            Войти
          </Link>
        </div>
      </div>
    </main>
  );
}