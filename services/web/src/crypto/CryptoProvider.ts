/**
 * Протокол-независимый контракт E2E-шифрования (ADR-004).
 *
 * Весь остальной код (UI, WS-слой, интеграция с ролями) обращается к шифрованию
 * ТОЛЬКО через этот интерфейс. Здесь нет ни одного Signal-специфичного понятия
 * уровня API: prekey/ratchet/sender-key живут внутри реализаций. Наружу торчат
 * лишь opaque-конверты и адреса устройств — этого достаточно и для Signal
 * (sender keys + pairwise-доставка ключей), и для будущего MLS (Welcome/Commit
 * ложатся в те же KeyEnvelope со scope "device"/"group").
 *
 * Инвариант всего модуля: приватный ключевой материал не покидает устройство.
 * Ни один метод не возвращает и не принимает приватные ключи — только
 * публичные бандлы и шифротекст.
 */

export type EncryptionProtocol = "signal" | "mls";

/** Адрес конкретного устройства пользователя. У пользователя может быть несколько. */
export interface DeviceAddress {
  userId: string;
  deviceId: number;
}

/**
 * Конверт зашифрованного сообщения. Сервер хранит и пересылает его как
 * непрозрачную строку (JSON.stringify) и никогда не разбирает содержимое.
 */
export interface EncryptedEnvelope {
  v: 1;
  protocol: EncryptionProtocol;
  kind: "direct" | "group";
  /** direct: тип pairwise-сообщения — "prekey" устанавливает новую сессию. */
  msgType?: "prekey" | "whisper";
  /** group: идентификатор раздачи группового ключа отправителя. */
  distributionId?: string;
  /** base64 шифротекста. */
  body: string;
}

/**
 * Ключевой материал, который нужно доставить другому устройству через
 * серверный mailbox. payload уже зашифрован pairwise-сессией с получателем —
 * сервер видит только маршрутные поля.
 */
export interface KeyEnvelope {
  recipient: DeviceAddress;
  chatId: string;
  payload: Uint8Array;
}

/**
 * Публичный prekey-бандл устройства — единственное, что публикуется на сервер.
 * deviceId здесь отсутствует: его назначает сервер при регистрации бандла.
 */
export interface DevicePublicBundle {
  registrationId: number;
  /** base64 публичного identity-ключа. */
  identityKey: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    /** Подпись identity-ключом — получатель обязан её проверить (делает libsignal). */
    signature: string;
  };
  oneTimePreKeys: { id: number; publicKey: string }[];
}

/** Ответ сервера на запрос бандла для X3DH-handshake. */
export interface FetchedPrekeyBundle {
  deviceId: number;
  registrationId: number;
  identityKey: string;
  signedPreKey: { id: number; publicKey: string; signature: string };
  /** Может отсутствовать: X3DH допускает handshake без one-time prekey. */
  oneTimePreKey: { id: number; publicKey: string } | null;
}

/**
 * Загрузчик чужих prekey-бандлов. Инжектится в провайдер, чтобы крипто-слой
 * не был связан с конкретным HTTP-клиентом.
 */
export type PrekeyBundleFetcher = (
  addr: DeviceAddress,
) => Promise<FetchedPrekeyBundle>;

export interface CryptoProvider {
  readonly protocol: EncryptionProtocol;

  // ── Жизненный цикл устройства ─────────────────────────────────────────────

  /**
   * Первичная инициализация устройства: identity key pair, signed prekey,
   * набор one-time prekeys. Идемпотентна — повторный вызов возвращает
   * уже существующий публичный бандл, не перегенерируя ключи.
   * Приватные части сохраняются только в локальном зашифрованном хранилище.
   */
  initDevice(): Promise<DevicePublicBundle>;

  isDeviceReady(): Promise<boolean>;

  /**
   * Зафиксировать адрес устройства, выданный сервером при публикации бандла.
   * Провайдер сам не ходит в сеть: initDevice → вызывающий код публикует
   * бандл → сервер выдаёт deviceId → completeDeviceRegistration.
   */
  completeDeviceRegistration(self: DeviceAddress): Promise<void>;

  /** Догенерировать one-time prekeys, когда сервер сообщает об исчерпании. */
  generateOneTimePrekeys(count: number): Promise<{ id: number; publicKey: string }[]>;

  /**
   * Полное уничтожение локального ключевого материала (логаут, потеря
   * устройства). После вызова история E2E-чатов на этом устройстве
   * нечитаема навсегда — это осознанное свойство протокола, не баг.
   */
  wipeDevice(): Promise<void>;

  // ── 1-на-1 (pairwise) ─────────────────────────────────────────────────────

  /**
   * Зашифровать для конкретного устройства. При первом обращении к адресату
   * реализация сама выполняет handshake (для Signal — X3DH по prekey-бандлу).
   */
  encryptDirect(to: DeviceAddress, plaintext: Uint8Array): Promise<EncryptedEnvelope>;

  decryptDirect(from: DeviceAddress, envelope: EncryptedEnvelope): Promise<Uint8Array>;

  // ── Группы ────────────────────────────────────────────────────────────────

  /**
   * Создать групповой ключевой материал для чата и подготовить его доставку
   * всем перечисленным устройствам. Возвращённые KeyEnvelope вызывающий код
   * отправляет через серверный mailbox.
   */
  createGroup(chatId: string, members: DeviceAddress[]): Promise<KeyEnvelope[]>;

  /** Доставить текущий групповой ключ новым участникам (без ротации). */
  addGroupMembers(chatId: string, added: DeviceAddress[]): Promise<KeyEnvelope[]>;

  /**
   * Реакция на удаление участника: ротация собственного группового ключа и
   * раздача нового ключа ТОЛЬКО оставшимся устройствам. Ключевой материал
   * удалённого пользователя выбрасывается — его новые сообщения перестают
   * расшифровываться.
   *
   * Вызывается из слоя интеграции по событию ролевой системы
   * (`e2ee_member_removed` из kick_member); сама проверка прав остаётся
   * на сервере и в этот модуль не просачивается.
   */
  removeGroupMember(
    chatId: string,
    removedUserId: string,
    remaining: DeviceAddress[],
  ): Promise<KeyEnvelope[]>;

  /** Обработать входящий KeyEnvelope.payload из mailbox. */
  processIncomingKey(from: DeviceAddress, payload: Uint8Array): Promise<void>;

  encryptGroupMessage(chatId: string, plaintext: Uint8Array): Promise<EncryptedEnvelope>;

  decryptGroupMessage(
    chatId: string,
    from: DeviceAddress,
    envelope: EncryptedEnvelope,
  ): Promise<Uint8Array>;
}

// ── Фабрика ──────────────────────────────────────────────────────────────────

export interface CryptoProviderDeps {
  fetchPrekeyBundle: PrekeyBundleFetcher;
}

/**
 * Единственная точка выбора протокола. Появление MLS в будущем — это новая
 * ветка здесь и новая реализация CryptoProvider, без изменений в вызывающем
 * коде (см. ADR-004, «Порог перехода на MLS»).
 */
export async function createCryptoProvider(
  protocol: EncryptionProtocol,
  deps: CryptoProviderDeps,
): Promise<CryptoProvider> {
  switch (protocol) {
    case "signal": {
      const { SignalCryptoProvider } = await import("./signal/SignalCryptoProvider");
      return SignalCryptoProvider.create(deps);
    }
    case "mls":
      throw new Error(
        "MLS не реализован: порог перехода из ADR-004 не пройден. " +
          "Группа с encryption_protocol='mls' не может быть открыта этим клиентом.",
      );
  }
}
