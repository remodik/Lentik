/**
 * Локальное хранилище ключевого материала: IndexedDB + шифрование at rest
 * через Web Crypto API (AES-256-GCM).
 *
 * Модель угроз и честные границы:
 *  - мастер-ключ создаётся с extractable=false и хранится как CryptoKey в
 *    IndexedDB: его байты невозможно прочитать даже коду самого приложения,
 *    ключом можно только пользоваться через subtle.encrypt/decrypt;
 *  - все значения (identity, сессии Double Ratchet, sender keys) лежат в БД
 *    только в зашифрованном виде, IV уникален на запись, а namespace+key
 *    подмешаны как AAD — шифротекст нельзя пересадить в другой слот;
 *  - границей защиты остаётся origin браузера: код, исполняющийся в origin
 *    (XSS), может ПОЛЬЗОВАТЬСЯ ключом. E2E защищает от сервера и сети,
 *    не от компрометации самого клиента — это свойство любой браузерной E2E.
 *
 * Приватные ключи не покидают этот модуль нигде, кроме вызовов WASM-ядра
 * через StorageDelegate — на сервер они не отправляются ни в каком виде.
 */

import type { StorageDelegate } from "./libsignalWasm";
import { utf8Encode } from "../util";

const DB_NAME = "lentik-e2ee";
const DB_VERSION = 1;
const STORE_KV = "kv";
const STORE_META = "meta";
const MASTER_KEY_ID = "master-key-v1";
const SLOT_SEP = ":";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function slotId(ns: string, key: string): string {
  // SLOT_SEP не встречается в namespace/key (оба — внутренние строковые
  // константы) — коллизии слотов исключены.
  return `${ns}${SLOT_SEP}${key}`;
}

interface EncryptedRecord {
  iv: ArrayBuffer;
  data: ArrayBuffer;
}

export class EncryptedStorage implements StorageDelegate {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly masterKey: CryptoKey,
  ) {}

  static async open(): Promise<EncryptedStorage> {
    const db = await openDb();

    let key = (await idbRequest(
      db.transaction(STORE_META, "readonly").objectStore(STORE_META).get(MASTER_KEY_ID),
    )) as CryptoKey | undefined;

    if (!key) {
      // extractable:false — байты ключа недоступны никому, включая нас самих.
      key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await idbRequest(
        db.transaction(STORE_META, "readwrite").objectStore(STORE_META).put(key, MASTER_KEY_ID),
      );
    }

    return new EncryptedStorage(db, key);
  }

  async get(ns: string, key: string): Promise<Uint8Array | null> {
    const record = (await idbRequest(
      this.db.transaction(STORE_KV, "readonly").objectStore(STORE_KV).get(slotId(ns, key)),
    )) as EncryptedRecord | undefined;
    if (!record) return null;

    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: record.iv,
        additionalData: utf8Encode(slotId(ns, key)) as BufferSource,
      },
      this.masterKey,
      record.data,
    );
    return new Uint8Array(plain);
  }

  async put(ns: string, key: string, value: Uint8Array): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: utf8Encode(slotId(ns, key)) as BufferSource,
      },
      this.masterKey,
      value as BufferSource,
    );
    const record: EncryptedRecord = { iv: iv.buffer, data };
    await idbRequest(
      this.db
        .transaction(STORE_KV, "readwrite")
        .objectStore(STORE_KV)
        .put(record, slotId(ns, key)),
    );
  }

  async delete(ns: string, key: string): Promise<void> {
    await idbRequest(
      this.db
        .transaction(STORE_KV, "readwrite")
        .objectStore(STORE_KV)
        .delete(slotId(ns, key)),
    );
  }

  async listKeys(ns: string): Promise<string[]> {
    const prefix = `${ns}${SLOT_SEP}`;
    // U+FFFF — noncharacter, лексикографически больше любой обычной строки:
    // верхняя граница диапазона "все ключи с этим префиксом".
    const upperBound = prefix + String.fromCharCode(0xffff);
    const range = IDBKeyRange.bound(prefix, upperBound);
    const keys = (await idbRequest(
      this.db.transaction(STORE_KV, "readonly").objectStore(STORE_KV).getAllKeys(range),
    )) as string[];
    return keys.map((k) => k.slice(prefix.length));
  }

  close(): void {
    this.db.close();
  }

  /**
   * Полное уничтожение хранилища вместе с мастер-ключом («потеря устройства»).
   * После этого ключевой материал невосстановим — так и задумано.
   */
  static async destroy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onblocked = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
