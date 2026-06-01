// Применяет сохранённую тему до первой отрисовки (без мигания).
// Вынесено из inline-скрипта layout.tsx ради CSP (script-src без 'unsafe-inline').
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
