/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50:  "#fdfaf5",
          100: "#f9f2e7",
          200: "#f0e4cc",
          300: "#e8d5b8",
          400: "#dfc4a0",
        },
        warm: {
          50:  "#fdf7f0",
          100: "#faebd7",
          200: "#f5d5b0",
          300: "#e5b885",
          400: "#c4956a",
          500: "#b07d52",
          600: "#8f6040",
          700: "#7a4d2f",
        },
        ink: {
          100: "#e8ddd8",
          200: "#c8b4a8",
          300: "#a89080",
          400: "#8a7068",
          500: "#6b5a4e",
          600: "#4a3b30",
          700: "#3d342c",
          800: "#251d18",
          900: "#1c1714",
        },
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      boxShadow: {
        "card":        "0 1px 3px rgba(28,23,20,0.05), 0 4px 16px rgba(28,23,20,0.04)",
        "card-hover":  "0 4px 16px rgba(28,23,20,0.09), 0 12px 40px rgba(28,23,20,0.06)",
        "float":       "0 8px 32px rgba(28,23,20,0.12), 0 2px 8px rgba(28,23,20,0.06)",
        "deep":        "0 24px 64px rgba(28,23,20,0.16), 0 4px 12px rgba(28,23,20,0.08)",
        "glass":       "0 2px 12px rgba(28,23,20,0.06), 0 8px 32px rgba(28,23,20,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
        "glass-hover": "0 4px 20px rgba(28,23,20,0.10), 0 16px 48px rgba(28,23,20,0.06), inset 0 1px 0 rgba(255,255,255,0.80)",
        "glass-float": "0 12px 40px rgba(28,23,20,0.14), 0 4px 12px rgba(28,23,20,0.06), inset 0 1px 0 rgba(255,255,255,0.90)",
        "warm-glow":   "0 0 0 3px rgba(196,149,106,0.22), 0 0 20px rgba(196,149,106,0.10)",
        "inset-sm":    "inset 0 1px 2px rgba(28,23,20,0.05)",
        "inner-top":   "inset 0 1px 0 rgba(255,255,255,0.80)",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "300": "300ms",
        "400": "400ms",
      },
      transitionTimingFunction: {
        "spring":         "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ease-out-expo":  "cubic-bezier(0.16, 1, 0.3, 1)",
        "ease-smooth":    "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        fadeUp: {
          "from": { opacity: "0", transform: "translateY(16px) scale(0.99)" },
          "to":   { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeIn:     { "from": { opacity: "0" }, "to": { opacity: "1" } },
        slideDown:  {
          "from": { opacity: "0", transform: "translateY(-8px) scale(0.97)" },
          "to":   { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        slideLeft:  {
          "from": { opacity: "0", transform: "translateX(16px) scale(0.98)" },
          "to":   { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        popIn: {
          "0%":   { transform: "scale(0.90) translateY(6px)", opacity: "0" },
          "60%":  { transform: "scale(1.025) translateY(-1px)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        toastIn: {
          "from": { opacity: "0", transform: "translateX(24px) scale(0.95)" },
          "to":   { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        notifPulse: {
          "0%":   { transform: "scale(1)" },
          "40%":  { transform: "scale(1.4)" },
          "100%": { transform: "scale(1)" },
        },
        wsDot: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
      },
      animation: {
        "fade-up":     "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
        "fade-in":     "fadeIn 0.3s ease forwards",
        "slide-down":  "slideDown 0.22s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-left":  "slideLeft 0.28s cubic-bezier(0.16,1,0.3,1) forwards",
        "pop":         "popIn 0.32s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "toast":       "toastIn 0.38s cubic-bezier(0.16,1,0.3,1) forwards",
        "notif-pulse": "notifPulse 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "ws-pulse":    "wsDot 1.4s ease-in-out infinite",
        "pulse":       "wsDot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
