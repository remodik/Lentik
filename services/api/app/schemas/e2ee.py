"""Pydantic-схемы E2EE-эндпоинтов.

Все крипто-поля — base64 либо публичного материала, либо pairwise-зашифрованных
блобов. Валидация проверяет только декодируемость и размеры (санитария против
мусора/раздувания БД) — содержимое сервер не интерпретирует.
"""

import base64
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# Публичный ключ Curve25519 — 32-33 байта, подпись — 64; лимиты с запасом
# на сериализационные обёртки libsignal, но достаточно тесные, чтобы поля
# нельзя было использовать как канал для произвольных данных.
MAX_KEY_BYTES = 64
MAX_SIGNATURE_BYTES = 128
MAX_MAILBOX_PAYLOAD_BYTES = 64 * 1024

# registrationId в libsignal — 14 бит.
MAX_REGISTRATION_ID = 0x3FFF
MAX_PREKEY_ID = 0xFFFFFF


def _require_b64(value: str, max_bytes: int, field: str) -> str:
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"{field}: невалидный base64") from exc
    if not raw:
        raise ValueError(f"{field}: пустое значение")
    if len(raw) > max_bytes:
        raise ValueError(f"{field}: больше {max_bytes} байт")
    return value


class SignedPrekey(BaseModel):
    id: int = Field(ge=0, le=MAX_PREKEY_ID)
    public_key: str
    signature: str

    @field_validator("public_key")
    @classmethod
    def _pk(cls, v: str) -> str:
        return _require_b64(v, MAX_KEY_BYTES, "public_key")

    @field_validator("signature")
    @classmethod
    def _sig(cls, v: str) -> str:
        return _require_b64(v, MAX_SIGNATURE_BYTES, "signature")


class OneTimePrekey(BaseModel):
    id: int = Field(ge=0, le=MAX_PREKEY_ID)
    public_key: str

    @field_validator("public_key")
    @classmethod
    def _pk(cls, v: str) -> str:
        return _require_b64(v, MAX_KEY_BYTES, "public_key")


class DeviceRegisterRequest(BaseModel):
    registration_id: int = Field(ge=1, le=MAX_REGISTRATION_ID)
    identity_key: str
    signed_prekey: SignedPrekey
    one_time_prekeys: list[OneTimePrekey] = Field(default_factory=list, max_length=200)

    @field_validator("identity_key")
    @classmethod
    def _ik(cls, v: str) -> str:
        return _require_b64(v, MAX_KEY_BYTES, "identity_key")


class DeviceRegisterResponse(BaseModel):
    user_id: UUID
    device_id: int


class DeviceInfo(BaseModel):
    device_id: int
    registration_id: int


class DevicesResponse(BaseModel):
    devices: list[DeviceInfo]


class PrekeyBundleResponse(BaseModel):
    device_id: int
    registration_id: int
    identity_key: str
    signed_prekey: SignedPrekey
    one_time_prekey: OneTimePrekey | None


class PrekeysPublishRequest(BaseModel):
    prekeys: list[OneTimePrekey] = Field(min_length=1, max_length=200)


class PrekeyCountResponse(BaseModel):
    count: int


class MailboxSendItem(BaseModel):
    recipient_user_id: UUID
    recipient_device_id: int = Field(ge=1)
    chat_id: UUID | None = None
    payload: str

    @field_validator("payload")
    @classmethod
    def _payload(cls, v: str) -> str:
        return _require_b64(v, MAX_MAILBOX_PAYLOAD_BYTES, "payload")


class MailboxSendRequest(BaseModel):
    # Потолок: ротация в большой семье = участники × устройства; 500 хватает
    # с запасом для семейного масштаба ADR-004.
    items: list[MailboxSendItem] = Field(min_length=1, max_length=500)


class MailboxItemResponse(BaseModel):
    id: UUID
    sender_user_id: UUID
    sender_device_id: int
    chat_id: UUID | None
    payload: str
    created_at: datetime


class MailboxResponse(BaseModel):
    items: list[MailboxItemResponse]
