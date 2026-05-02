import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";

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
    themeColor: "#1c1714",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru" suppressHydrationWarning>
        <head>
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        (function () {
                            try {
                                var key = "lentik-theme";
                                var stored = localStorage.getItem(key);
                                var allowed = { warm: 1, dark: 1, cyberpunk: 1, retro: 1, sakura: 1 };
                                var theme = allowed[stored] ? stored : "warm";
                                var root = document.documentElement;
                                if (theme === "warm") {
                                    root.removeAttribute("data-theme");
                                    root.style.colorScheme = "light";
                                    return;
                                }
                                root.setAttribute("data-theme", theme);
                                root.style.colorScheme = theme === "dark" ? "dark" : "light";
                            } catch (_) {}
                        })();
                    `,
                }}
            />
        </head>
        <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/*
            Не регистрируем service worker. У ранних посетителей мог
            остаться зарегистрированный /sw.js — для них в /public/sw.js
            лежит self-unregistering worker, который при активации чистит
            кэши и снимает регистрацию.
        */}
        <script dangerouslySetInnerHTML={{
            __html: `
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function (regs) {
                        regs.forEach(function (reg) { reg.unregister().catch(function(){}); });
                    }).catch(function(){});
                }
            `
        }} />
        </body>
        </html>
    );
}
