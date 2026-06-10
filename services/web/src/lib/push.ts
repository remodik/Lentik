import { apiFetch } from "./api-base";

// Подписка браузера на Web Push. Всё best-effort и тихое: если push выключен на
// сервере (нет VAPID-ключей), нет прав или браузер не поддерживает — просто
// выходим, ничего не ломая. Вызывается один раз после входа (см. app/app/page).

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getServerKey(): Promise<string | null> {
  try {
    const res = await apiFetch("/me/push/public-key");
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; public_key?: string };
    return data.enabled && data.public_key ? data.public_key : null;
  } catch {
    return null;
  }
}

/**
 * Регистрирует push-воркер и подписывает браузер. Не запрашивает разрешение
 * сам по себе агрессивно: вызывайте после явного действия пользователя, либо
 * один раз при заходе — если разрешение уже выдано, подписка тихо обновится.
 */
export async function initPushNotifications(): Promise<void> {
  if (!isSupported()) return;

  const serverKey = await getServerKey();
  if (!serverKey) return; // push выключен на сервере

  // Если разрешение ещё не выдано и не отклонено — спросим. Отклонённое не трогаем.
  if (Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    let perm: NotificationPermission;
    try {
      perm = await Notification.requestPermission();
    } catch {
      return;
    }
    if (perm !== "granted") return;
  }

  try {
    const reg = await navigator.serviceWorker.register("/push-sw.js");
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(serverKey),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await apiFetch("/me/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }),
    });
  } catch {
    // Тихо: отсутствие push не должно мешать работе приложения.
  }
}

/** Отписаться от push (например, при выходе). Best-effort. */
export async function disablePushNotifications(): Promise<void> {
  if (!isSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await apiFetch("/me/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}
