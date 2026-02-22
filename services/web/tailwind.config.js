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
                },
                warm: {
                    400: "#c4956a",
                    500: "#b07d52",
                    600: "#8f6040",
                },
                ink: {
                    900: "#1c1714",
                    700: "#3d342c",
                    500: "#6b5a4e",
                    300: "#a89080",
                },
            },
            fontFamily: {
                display: ["'Playfair Display'", "Georgia", "serif"],
                body: ["'DM Sans'", "sans-serif"],
            },
            borderRadius: {
                "2xl": "1rem",
                "3xl": "1.5rem",
                "4xl": "2rem",
            },
        },
    },
    plugins: [],
};