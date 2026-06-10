// Снимаем только ЛЕГАСИ кэширующий воркер (старый /sw.js), который у ранних
// посетителей мог застрять и отдавать устаревшие страницы. Push-воркер
// (/push-sw.js) НЕ трогаем — он нужен для уведомлений вне приложения.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
            var sw = reg.active || reg.waiting || reg.installing;
            var url = (sw && sw.scriptURL) ? sw.scriptURL : '';
            if (url.indexOf('/push-sw.js') === -1) {
                reg.unregister().catch(function () {});
            }
        });
    }).catch(function () {});
}
