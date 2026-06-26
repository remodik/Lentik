import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
    title: "Lentik — Семейный альбом",
    description: "Закрытое семейное пространство: фото и видео только для своих",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Lentik",
    },
    icons: {
        icon: [
            { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    // На мобиле экранная клавиатура «ужимает» вьюпорт, а не наезжает на контент,
    // чтобы поля ввода (чат, формы) не перекрывались клавиатурой iOS/Android.
    interactiveWidget: "resizes-content",
    themeColor: "#1c1714",
};

function originOf(value: string | undefined, fallback: string): string {
    try {
        return new URL(value || fallback).origin;
    } catch {
        return "";
    }
}

/**
 * CSP для статического экспорта (CWE-693). Собирается на этапе сборки.
 *
 * Ограничения движка: это App Router со `output: export`, поэтому per-request
 * nonce невозможен, а Next эмитит inline-bootstrap скрипты — без `'unsafe-inline'`
 * приложение не загрузится. Поэтому script-src здесь оставляет inline, но
 * остальная политика заперта: object-src 'none', base-uri/form-action 'self',
 * connect/img/media — только свой origin и origin API. Строгий nonce-CSP и
 * заголовок frame-ancestors/X-Frame-Options должны выставляться на отдающем
 * статику слое (CDN/reverse-proxy) — см. заметку M7.
 */
function buildCsp(): string {
    const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE, "http://localhost:8000");
    const wsOrigin = originOf(process.env.NEXT_PUBLIC_WS_BASE, "ws://localhost:8000");
    const isProd = process.env.NODE_ENV === "production";
    // В dev Next использует eval/inline для HMR — иначе сломается `next dev`.
    const scriptSrc = isProd
        ? "'self' 'unsafe-inline'"
        : "'self' 'unsafe-inline' 'unsafe-eval'";
    const connect = ["'self'", apiOrigin, wsOrigin].filter(Boolean).join(" ");
    const media = ["'self'", "blob:", apiOrigin].filter(Boolean).join(" ");
    const img = ["'self'", "data:", "blob:", apiOrigin].filter(Boolean).join(" ");
    return [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src ${img}`,
        `media-src ${media}`,
        `connect-src ${connect}`,
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join("; ");
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru" suppressHydrationWarning>
        <head>
            <meta httpEquiv="Content-Security-Policy" content={buildCsp()} />
            <meta name="referrer" content="no-referrer" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
            {/* Применяет тему до первой отрисовки. Внешний файл — ради CSP. */}
            <script src="/theme-init.js" />
        </head>
        <body>
        <ThemeProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
        {/*
            Не регистрируем service worker. У ранних посетителей мог
            остаться зарегистрированный /sw.js — для них в /public/sw.js
            лежит self-unregistering worker, который при активации чистит
            кэши и снимает регистрацию. Снятие регистрации — во внешнем файле.
        */}
        <script src="/sw-unregister.js" defer />
        <Analytics />
        </body>
        </html>
    );
}
