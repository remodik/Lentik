/**
 * Типизированная граница между TypeScript и WASM-сборкой официального
 * libsignal (Rust → wasm-bindgen). Это НЕ реализация криптографии: все
 * примитивы (X3DH, Double Ratchet, Sender Keys) исполняются внутри WASM-модуля,
 * собранного из signalapp/libsignal (rust/protocol). Данный файл — контракт,
 * которому обязан соответствовать wasm-bindgen-враппер (crates/lentik-libsignal-wasm).
 *
 * Инварианты границы:
 *  - приватные ключи существуют только внутри WASM-памяти и в StorageDelegate
 *    в сериализованном виде (делегат шифрует их at rest, см. encryptedStorage);
 *  - TS-слой никогда не интерпретирует байты ключей и сессий — только
 *    перекладывает их между WASM и хранилищем;
 *  - собственных крипто-примитивов на JS-стороне нет.
 */

// ── Персистентность: WASM хранит все стора через этот делегат ────────────────
// Rust-обёртка реализует IdentityKeyStore / PreKeyStore / SignedPreKeyStore /
// SessionStore / SenderKeyStore поверх этих четырёх методов.

export interface StorageDelegate {
  get(ns: string, key: string): Promise<Uint8Array | null>;
  put(ns: string, key: string, value: Uint8Array): Promise<void>;
  delete(ns: string, key: string): Promise<void>;
  listKeys(ns: string): Promise<string[]>;
}

export interface DirectCiphertext {
  /** "prekey" — PreKeySignalMessage (первое сообщение X3DH), "whisper" — обычный Double Ratchet. */
  type: "prekey" | "whisper";
  body: Uint8Array;
}

export interface RemotePrekeyBundle {
  registrationId: number;
  deviceId: number;
  identityKey: Uint8Array;
  signedPreKeyId: number;
  signedPreKey: Uint8Array;
  /** Проверяется внутри libsignal при processPreKeyBundle; невалидная подпись = исключение. */
  signedPreKeySignature: Uint8Array;
  preKeyId: number | null;
  preKey: Uint8Array | null;
}

/**
 * Контракт wasm-bindgen-класса `LibsignalClient`.
 * Соответствие API libsignal (rust/protocol):
 *  - processPreKeyBundle → process_prekey_bundle (X3DH, исходящая сессия)
 *  - encrypt/decrypt* → message_encrypt / message_decrypt(_prekey)
 *  - createSenderKeyDistribution → SenderKeyDistributionMessage::new
 *  - processSenderKeyDistribution → process_sender_key_distribution_message
 *  - groupEncrypt/groupDecrypt → group_encrypt / group_decrypt
 */
export interface LibsignalWasmClient {
  // ── Identity / prekeys ──────────────────────────────────────────────────
  hasIdentity(): Promise<boolean>;
  /** Генерирует identity key pair + registrationId. Повторный вызов — ошибка. */
  createIdentity(): Promise<{ registrationId: number; identityKey: Uint8Array }>;
  getPublicIdentity(): Promise<{ registrationId: number; identityKey: Uint8Array }>;
  generateSignedPreKey(
    id: number,
  ): Promise<{ id: number; publicKey: Uint8Array; signature: Uint8Array }>;
  generatePreKeys(
    startId: number,
    count: number,
  ): Promise<{ id: number; publicKey: Uint8Array }[]>;

  // ── Pairwise (X3DH + Double Ratchet) ────────────────────────────────────
  hasSession(userId: string, deviceId: number): Promise<boolean>;
  processPreKeyBundle(
    userId: string,
    deviceId: number,
    bundle: RemotePrekeyBundle,
  ): Promise<void>;
  encrypt(
    userId: string,
    deviceId: number,
    plaintext: Uint8Array,
  ): Promise<DirectCiphertext>;
  decryptPreKey(
    userId: string,
    deviceId: number,
    body: Uint8Array,
  ): Promise<Uint8Array>;
  decryptWhisper(
    userId: string,
    deviceId: number,
    body: Uint8Array,
  ): Promise<Uint8Array>;

  // ── Группы (Sender Keys) ────────────────────────────────────────────────
  /** Создать/получить собственный sender key раздачи distributionId и вернуть SKDM. */
  createSenderKeyDistribution(
    selfUserId: string,
    selfDeviceId: number,
    distributionId: string,
  ): Promise<Uint8Array>;
  processSenderKeyDistribution(
    senderUserId: string,
    senderDeviceId: number,
    skdm: Uint8Array,
  ): Promise<void>;
  groupEncrypt(
    selfUserId: string,
    selfDeviceId: number,
    distributionId: string,
    plaintext: Uint8Array,
  ): Promise<Uint8Array>;
  /** distributionId зашит в сам шифротекст — для расшифровки достаточно адреса отправителя. */
  groupDecrypt(
    senderUserId: string,
    senderDeviceId: number,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array>;
  /** Ротация: собственный ключ старой раздачи уничтожается. */
  deleteOwnSenderKey(
    selfUserId: string,
    selfDeviceId: number,
    distributionId: string,
  ): Promise<void>;
  /** Выбросить все sender keys пользователя (после его удаления из группы). */
  deleteSenderKeysFromUser(userId: string): Promise<void>;
}

export type LibsignalWasmFactory = (
  storage: StorageDelegate,
) => Promise<LibsignalWasmClient>;

// ── Регистрация артефакта сборки ─────────────────────────────────────────────
// WASM-модуль подключается отдельным бандлом (см. crates/lentik-libsignal-wasm
// в задачах на сборку) и регистрирует себя здесь при загрузке. Такой шов
// позволяет проекту типизироваться и собираться до появления артефакта,
// не подменяя криптографию никакой JS-заглушкой.

let factory: LibsignalWasmFactory | null = null;

export function registerLibsignalWasm(f: LibsignalWasmFactory): void {
  factory = f;
}

export async function loadLibsignalWasm(
  storage: StorageDelegate,
): Promise<LibsignalWasmClient> {
  if (!factory) {
    throw new Error(
      "libsignal WASM-модуль не зарегистрирован. E2E-чаты недоступны в этой " +
        "сборке: подключите артефакт lentik-libsignal-wasm (registerLibsignalWasm).",
    );
  }
  return factory(storage);
}
