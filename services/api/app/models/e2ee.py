"""E2EE (ADR-004): реестр устройств, one-time prekeys и mailbox.

Сервер здесь — исключительно хранение и пересылка. Во всех таблицах лежит
либо ПУБЛИЧНЫЙ ключевой материал (identity_key, prekeys — их публикация и
есть смысл протокола), либо непрозрачные блобы, зашифрованные pairwise-сессиями
клиентов (payload в mailbox). Приватные ключи и состояния Double Ratchet
существуют только на устройствах — серверу расшифровать содержимое нечем.
Никакого структурированного парсинга блобов на сервере нет и быть не должно.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.db.base import Base


class E2EEDevice(Base):
    """Устройство пользователя с опубликованным prekey-бандлом."""

    __tablename__ = "e2ee_devices"
    __table_args__ = (
        UniqueConstraint("user_id", "device_id", name="uq_e2ee_devices_user_device"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Порядковый номер устройства в рамках пользователя; выдаёт сервер.
    device_id: Mapped[int] = mapped_column(Integer, nullable=False)
    registration_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Публичные части бандла (opaque bytes — сервер их не интерпретирует).
    identity_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    signed_prekey_id: Mapped[int] = mapped_column(Integer, nullable=False)
    signed_prekey: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    signed_prekey_signature: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    one_time_prekeys: Mapped[list["E2EEOneTimePrekey"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<E2EEDevice user={self.user_id} device_id={self.device_id}>"


class E2EEOneTimePrekey(Base):
    """Одноразовый prekey. Выдаётся ровно один раз (pop при выдаче бандла)."""

    __tablename__ = "e2ee_one_time_prekeys"
    __table_args__ = (
        UniqueConstraint("device_pk", "key_id", name="uq_e2ee_otp_device_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    device_pk: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("e2ee_devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    device: Mapped["E2EEDevice"] = relationship(back_populates="one_time_prekeys")


class E2EEMailboxItem(Base):
    """Key-exchange блоб «до востребования» (SKDM и пр.) для офлайн-устройств.

    payload зашифрован pairwise-сессией отправитель→получатель. Сервер видит
    только маршрут (кто, кому, для какого чата) и удаляет запись после ack.
    """

    __tablename__ = "e2ee_mailbox"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipient_device_pk: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("e2ee_devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    sender_device_id: Mapped[int] = mapped_column(Integer, nullable=False)
    chat_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=True
    )
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
