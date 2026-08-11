/**
 * HTTP-клиент серверных E2EE-эндпоинтов (см. services/api/app/routers/e2ee.py).
 *
 * Через эти вызовы на сервер уходит ТОЛЬКО публичный ключевой материал и
 * pairwise-зашифрованные блобы. Приватные ключи не сериализуются в этот
 * модуль ни одним путём.
 */

import { apiFetch } from "@/lib/api-base";
import type {
  DeviceAddress,
  DevicePublicBundle,
  FetchedPrekeyBundle,
  KeyEnvelope,
} from "../CryptoProvider";
import { fromBase64, toBase64 } from "../util";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, { cache: "no-store", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(
      typeof err.detail === "string" ? err.detail : "Ошибка E2EE-эндпоинта",
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Устройства и prekey-бандлы ───────────────────────────────────────────────

export function registerDevice(bundle: DevicePublicBundle) {
  return request<{ user_id: string; device_id: number }>("/e2ee/devices/register", {
    method: "POST",
    body: JSON.stringify({
      registration_id: bundle.registrationId,
      identity_key: bundle.identityKey,
      signed_prekey: {
        id: bundle.signedPreKey.id,
        public_key: bundle.signedPreKey.publicKey,
        signature: bundle.signedPreKey.signature,
      },
      one_time_prekeys: bundle.oneTimePreKeys.map((k) => ({
        id: k.id,
        public_key: k.publicKey,
      })),
    }),
  });
}

export function listUserDevices(userId: string) {
  return request<{ devices: { device_id: number; registration_id: number }[] }>(
    `/e2ee/users/${userId}/devices`,
  );
}

export async function fetchPrekeyBundle(
  addr: DeviceAddress,
): Promise<FetchedPrekeyBundle> {
  const b = await request<{
    device_id: number;
    registration_id: number;
    identity_key: string;
    signed_prekey: { id: number; public_key: string; signature: string };
    one_time_prekey: { id: number; public_key: string } | null;
  }>(`/e2ee/users/${addr.userId}/devices/${addr.deviceId}/prekey-bundle`);

  return {
    deviceId: b.device_id,
    registrationId: b.registration_id,
    identityKey: b.identity_key,
    signedPreKey: {
      id: b.signed_prekey.id,
      publicKey: b.signed_prekey.public_key,
      signature: b.signed_prekey.signature,
    },
    oneTimePreKey: b.one_time_prekey
      ? { id: b.one_time_prekey.id, publicKey: b.one_time_prekey.public_key }
      : null,
  };
}

export function publishPrekeys(
  deviceId: number,
  prekeys: { id: number; publicKey: string }[],
) {
  return request<void>(`/e2ee/devices/${deviceId}/prekeys`, {
    method: "POST",
    body: JSON.stringify({
      prekeys: prekeys.map((k) => ({ id: k.id, public_key: k.publicKey })),
    }),
  });
}

/** Потеря устройства: бандл и недоставленные блобы устройства удаляются с сервера. */
export function revokeDevice(deviceId: number) {
  return request<void>(`/e2ee/devices/${deviceId}`, { method: "DELETE" });
}

// ── Mailbox для key-exchange блобов ──────────────────────────────────────────

export function sendKeyEnvelopes(envelopes: KeyEnvelope[]) {
  if (envelopes.length === 0) return Promise.resolve();
  return request<void>("/e2ee/mailbox", {
    method: "POST",
    body: JSON.stringify({
      items: envelopes.map((e) => ({
        recipient_user_id: e.recipient.userId,
        recipient_device_id: e.recipient.deviceId,
        chat_id: e.chatId,
        payload: toBase64(e.payload),
      })),
    }),
  });
}

export interface MailboxItem {
  id: string;
  sender: DeviceAddress;
  chatId: string | null;
  payload: Uint8Array;
}

export interface MailboxPage {
  items: MailboxItem[];
  /** Есть ли ещё непрочитанные блобы сверх этой страницы — если true, после
   * ack текущих нужно вызвать fetchMailbox повторно (см. MAILBOX_PAGE на сервере). */
  hasMore: boolean;
}

export async function fetchMailbox(deviceId: number): Promise<MailboxPage> {
  const data = await request<{
    items: {
      id: string;
      sender_user_id: string;
      sender_device_id: number;
      chat_id: string | null;
      payload: string;
    }[];
    has_more: boolean;
  }>(`/e2ee/mailbox?device_id=${deviceId}`);

  return {
    items: data.items.map((i) => ({
      id: i.id,
      sender: { userId: i.sender_user_id, deviceId: i.sender_device_id },
      chatId: i.chat_id,
      payload: fromBase64(i.payload),
    })),
    hasMore: data.has_more,
  };
}

/** Подтверждение обработки: элемент удаляется с сервера ПОСЛЕ успешного processIncomingKey. */
export function ackMailboxItem(itemId: string) {
  return request<void>(`/e2ee/mailbox/${itemId}`, { method: "DELETE" });
}
