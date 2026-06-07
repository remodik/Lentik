"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";

/**
 * CTA «Войти» для лендинга. Cookie httpOnly из JS не прочитать, поэтому
 * проверяем сессию запросом getMe(): если авторизован — ведём сразу в /app,
 * иначе на /login.
 */
export default function EnterAppButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await getMe();
      router.push("/app");
    } catch {
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
      data-testid="enter-app-btn"
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Открываем…
        </span>
      ) : (
        children ?? "Войти"
      )}
    </button>
  );
}
