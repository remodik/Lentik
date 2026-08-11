/**
 * SignalCryptoProvider — реализация CryptoProvider поверх официального
 * libsignal (WASM-сборка, см. libsignalWasm.ts).
 *
 * Схема (классическая для Signal-групп):
 *  - 1-на-1: X3DH по prekey-бандлу + Double Ratchet. Выполняется целиком
 *    внутри libsignal; этот класс только управляет установкой сессий.
 *  - Группы: Sender Keys. У каждого отправителя — свой групповой ключ на чат
 *    (distributionId), который доставляется каждому устройству-участнику
 *    pairwise-сообщением (SKDM внутри Double Ratchet-конверта).
 *  - Удаление участника: собственный sender key уничтожается и создаётся
 *    заново (новый distributionId), новый SKDM рассылается только оставшимся.
 *    Ключи удалённого пользователя выбрасываются из хранилища.
 *
 * Инварианты:
 *  - весь приватный материал живёт в EncryptedStorage (IndexedDB, AES-GCM
 *    at rest) и не сериализуется наружу этим классом;
 *  - на сервер уходят только: публичный бандл, шифротекст сообщений и
 *    pairwise-зашифрованные KeyEnvelope — расшифровать их сервер не может;
 *  - крипто-примитивы не реализуются здесь ни в каком виде — только вызовы
 *    libsignal через типизированную WASM-границу.
 */

import type {
  CryptoProvider,
  CryptoProviderDeps,
  DeviceAddress,
  DevicePublicBundle,
  EncryptedEnvelope,
  KeyEnvelope,
} from "../CryptoProvider";
import { fromBase64, toBase64, utf8Decode, utf8Encode } from "../util";
import { EncryptedStorage } from "./encryptedStorage";
import { loadLibsignalWasm, type LibsignalWasmClient } from "./libsignalWasm";

// Namespaces TS-слоя в EncryptedStorage. WASM-ядро держит свои стора
// (identity/sessions/prekeys/sender keys) в собственных namespaces через
// тот же StorageDelegate — они непрозрачны для этого класса.
const NS_META = "provider_meta";
const KEY_LOCAL_ADDRESS = "local_address";
const KEY_BUNDLE = "bundle";
const KEY_NEXT_PREKEY_ID = "next_prekey_id";
const NS_GROUPS = "group_state";

const SIGNED_PREKEY_ID = 1;
const INITIAL_ONETIME_PREKEYS = 100;

interface GroupState {
  ownDistributionId: string;
  /** Устройства ("userId.deviceId"), которым уже доставлен текущий SKDM. */
  deliveredTo: string[];
}

/** Внутренность KeyEnvelope.payload ДО pairwise-шифрования. */
interface SkdmPayload {
  v: 1;
  kind: "skdm";
  chatId: string;
  distributionId: string;
  skdm: string; // base64
}

function addrKey(a: DeviceAddress): string {
  return `${a.userId}.${a.deviceId}`;
}

export class SignalCryptoProvider implements CryptoProvider {
  readonly protocol = "signal" as const;

  private constructor(
    private readonly storage: EncryptedStorage,
    private readonly wasm: LibsignalWasmClient,
    private readonly deps: CryptoProviderDeps,
  ) {}

  static async create(deps: CryptoProviderDeps): Promise<SignalCryptoProvider> {
    const storage = await EncryptedStorage.open();
    const wasm = await loadLibsignalWasm(storage);
    return new SignalCryptoProvider(storage, wasm, deps);
  }

  // ── Служебное состояние ───────────────────────────────────────────────────

  private async readJson<T>(ns: string, key: string): Promise<T | null> {
    const raw = await this.storage.get(ns, key);
    return raw ? (JSON.parse(utf8Decode(raw)) as T) : null;
  }

  private async writeJson(ns: string, key: string, value: unknown): Promise<void> {
    await this.storage.put(ns, key, utf8Encode(JSON.stringify(value)));
  }

  private async requireLocalAddress(): Promise<DeviceAddress> {
    const addr = await this.readJson<DeviceAddress>(NS_META, KEY_LOCAL_ADDRESS);
    if (!addr) {
      throw new Error(
        "Устройство не зарегистрировано: сначала initDevice → публикация бандла → completeDeviceRegistration.",
      );
    }
    return addr;
  }

  // ── Жизненный цикл устройства ─────────────────────────────────────────────

  async initDevice(): Promise<DevicePublicBundle> {
    const existing = await this.readJson<DevicePublicBundle>(NS_META, KEY_BUNDLE);
    if (existing) return existing;

    const identity = (await this.wasm.hasIdentity())
      ? await this.wasm.getPublicIdentity()
      : await this.wasm.createIdentity();

    const signed = await this.wasm.generateSignedPreKey(SIGNED_PREKEY_ID);
    const oneTime = await this.wasm.generatePreKeys(1, INITIAL_ONETIME_PREKEYS);
    await this.writeJson(NS_META, KEY_NEXT_PREKEY_ID, INITIAL_ONETIME_PREKEYS + 1);

    const bundle: DevicePublicBundle = {
      registrationId: identity.registrationId,
      identityKey: toBase64(identity.identityKey),
      signedPreKey: {
        id: signed.id,
        publicKey: toBase64(signed.publicKey),
        signature: toBase64(signed.signature),
      },
      oneTimePreKeys: oneTime.map((k) => ({ id: k.id, publicKey: toBase64(k.publicKey) })),
    };
    await this.writeJson(NS_META, KEY_BUNDLE, bundle);
    return bundle;
  }

  async completeDeviceRegistration(self: DeviceAddress): Promise<void> {
    await this.writeJson(NS_META, KEY_LOCAL_ADDRESS, self);
  }

  async isDeviceReady(): Promise<boolean> {
    if (!(await this.wasm.hasIdentity())) return false;
    return (await this.readJson<DeviceAddress>(NS_META, KEY_LOCAL_ADDRESS)) !== null;
  }

  async generateOneTimePrekeys(
    count: number,
  ): Promise<{ id: number; publicKey: string }[]> {
    const next = (await this.readJson<number>(NS_META, KEY_NEXT_PREKEY_ID)) ?? 1;
    const keys = await this.wasm.generatePreKeys(next, count);
    await this.writeJson(NS_META, KEY_NEXT_PREKEY_ID, next + count);
    return keys.map((k) => ({ id: k.id, publicKey: toBase64(k.publicKey) }));
  }

  async wipeDevice(): Promise<void> {
    this.storage.close();
    await EncryptedStorage.destroy();
  }

  // ── 1-на-1 ────────────────────────────────────────────────────────────────

  private async ensureSession(to: DeviceAddress): Promise<void> {
    if (await this.wasm.hasSession(to.userId, to.deviceId)) return;

    // X3DH: подпись signed prekey и identity адресата проверяет libsignal
    // внутри processPreKeyBundle — подделанный бандл даст исключение.
    const b = await this.deps.fetchPrekeyBundle(to);
    await this.wasm.processPreKeyBundle(to.userId, to.deviceId, {
      registrationId: b.registrationId,
      deviceId: b.deviceId,
      identityKey: fromBase64(b.identityKey),
      signedPreKeyId: b.signedPreKey.id,
      signedPreKey: fromBase64(b.signedPreKey.publicKey),
      signedPreKeySignature: fromBase64(b.signedPreKey.signature),
      preKeyId: b.oneTimePreKey?.id ?? null,
      preKey: b.oneTimePreKey ? fromBase64(b.oneTimePreKey.publicKey) : null,
    });
  }

  async encryptDirect(
    to: DeviceAddress,
    plaintext: Uint8Array,
  ): Promise<EncryptedEnvelope> {
    await this.ensureSession(to);
    const ct = await this.wasm.encrypt(to.userId, to.deviceId, plaintext);
    return {
      v: 1,
      protocol: "signal",
      kind: "direct",
      msgType: ct.type,
      body: toBase64(ct.body),
    };
  }

  async decryptDirect(
    from: DeviceAddress,
    envelope: EncryptedEnvelope,
  ): Promise<Uint8Array> {
    if (envelope.kind !== "direct") {
      throw new Error("Ожидался direct-конверт");
    }
    const body = fromBase64(envelope.body);
    return envelope.msgType === "prekey"
      ? this.wasm.decryptPreKey(from.userId, from.deviceId, body)
      : this.wasm.decryptWhisper(from.userId, from.deviceId, body);
  }

  // ── Группы ────────────────────────────────────────────────────────────────

  private async distributeSenderKey(
    chatId: string,
    state: GroupState,
    devices: DeviceAddress[],
  ): Promise<KeyEnvelope[]> {
    const self = await this.requireLocalAddress();
    const skdm = await this.wasm.createSenderKeyDistribution(
      self.userId,
      self.deviceId,
      state.ownDistributionId,
    );

    const payload: SkdmPayload = {
      v: 1,
      kind: "skdm",
      chatId,
      distributionId: state.ownDistributionId,
      skdm: toBase64(skdm),
    };
    const payloadBytes = utf8Encode(JSON.stringify(payload));

    const out: KeyEnvelope[] = [];
    for (const device of devices) {
      if (addrKey(device) === addrKey(self)) continue;
      if (state.deliveredTo.includes(addrKey(device))) continue;
      // SKDM уходит внутри pairwise Double Ratchet-конверта: сервер видит
      // только маршрут (кому/какой чат), но не сам групповой ключ.
      const env = await this.encryptDirect(device, payloadBytes);
      out.push({
        recipient: device,
        chatId,
        payload: utf8Encode(JSON.stringify(env)),
      });
      state.deliveredTo.push(addrKey(device));
    }
    await this.writeJson(NS_GROUPS, chatId, state);
    return out;
  }

  private async rotateOwnSenderKey(chatId: string): Promise<GroupState> {
    const self = await this.requireLocalAddress();
    const old = await this.readJson<GroupState>(NS_GROUPS, chatId);
    if (old) {
      await this.wasm.deleteOwnSenderKey(self.userId, self.deviceId, old.ownDistributionId);
    }
    const state: GroupState = {
      ownDistributionId: crypto.randomUUID(),
      deliveredTo: [],
    };
    await this.writeJson(NS_GROUPS, chatId, state);
    return state;
  }

  async createGroup(chatId: string, members: DeviceAddress[]): Promise<KeyEnvelope[]> {
    const state = await this.rotateOwnSenderKey(chatId);
    return this.distributeSenderKey(chatId, state, members);
  }

  async addGroupMembers(chatId: string, added: DeviceAddress[]): Promise<KeyEnvelope[]> {
    const state =
      (await this.readJson<GroupState>(NS_GROUPS, chatId)) ??
      (await this.rotateOwnSenderKey(chatId));
    // Добавление НЕ ротирует ключ: новый участник не может читать прошлое,
    // потому что не имеет старых состояний цепочки (forward secrecy истории
    // обеспечивается тем, что SKDM содержит только текущую позицию цепочки).
    return this.distributeSenderKey(chatId, state, added);
  }

  async removeGroupMember(
    chatId: string,
    removedUserId: string,
    remaining: DeviceAddress[],
  ): Promise<KeyEnvelope[]> {
    // 1. Ключи удалённого выбрасываются: его новые сообщения в группу
    //    перестанут расшифровываться даже при компрометации сервера.
    await this.wasm.deleteSenderKeysFromUser(removedUserId);

    // 2. Собственный ключ ротируется, новый SKDM — только оставшимся.
    //    Удалённый больше никогда не получит материал для чтения новых
    //    сообщений. Это и есть ротация из ADR-004.
    const state = await this.rotateOwnSenderKey(chatId);
    const survivors = remaining.filter((d) => d.userId !== removedUserId);
    return this.distributeSenderKey(chatId, state, survivors);
  }

  async processIncomingKey(from: DeviceAddress, payload: Uint8Array): Promise<void> {
    const envelope = JSON.parse(utf8Decode(payload)) as EncryptedEnvelope;
    const inner = JSON.parse(
      utf8Decode(await this.decryptDirect(from, envelope)),
    ) as SkdmPayload;
    if (inner.kind !== "skdm") {
      throw new Error(`Неизвестный тип ключевого сообщения: ${inner.kind}`);
    }
    await this.wasm.processSenderKeyDistribution(
      from.userId,
      from.deviceId,
      fromBase64(inner.skdm),
    );
  }

  async encryptGroupMessage(
    chatId: string,
    plaintext: Uint8Array,
  ): Promise<EncryptedEnvelope> {
    const self = await this.requireLocalAddress();
    const state = await this.readJson<GroupState>(NS_GROUPS, chatId);
    if (!state) {
      throw new Error(
        "Нет группового ключа для чата: перед первой отправкой вызовите createGroup/addGroupMembers " +
          "и доставьте KeyEnvelope через mailbox.",
      );
    }
    const ct = await this.wasm.groupEncrypt(
      self.userId,
      self.deviceId,
      state.ownDistributionId,
      plaintext,
    );
    return {
      v: 1,
      protocol: "signal",
      kind: "group",
      distributionId: state.ownDistributionId,
      body: toBase64(ct),
    };
  }

  async decryptGroupMessage(
    _chatId: string,
    from: DeviceAddress,
    envelope: EncryptedEnvelope,
  ): Promise<Uint8Array> {
    if (envelope.kind !== "group") {
      throw new Error("Ожидался group-конверт");
    }
    return this.wasm.groupDecrypt(from.userId, from.deviceId, fromBase64(envelope.body));
  }
}
