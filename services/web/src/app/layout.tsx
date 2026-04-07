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
        <html lang="ru">
        <head>
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        </head>
        <body>
        <ThemeProvider>{children}</ThemeProvider>
        <script dangerouslySetInnerHTML={{
            __html: `
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', function() {
                        navigator.serviceWorker.register('/sw.js').catch(function(){});
                    });
                }
            `
        }} />
        </body>
        </html>
    );
}
