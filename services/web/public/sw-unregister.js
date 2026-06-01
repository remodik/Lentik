// У ранних посетителей мог остаться зарегистрированный /sw.js — снимаем регистрацию.
// Вынесено из inline-скрипта layout.tsx ради CSP (script-src без 'unsafe-inline').
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister().catch(function () {}); });
    }).catch(function () {});
}
