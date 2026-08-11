"""E2EE-эндпоинты: реестр устройств, prekey-бандлы, mailbox key-exchange блобов.

АРХИТЕКТУРНОЕ ОГРАНИЧЕНИЕ (ADR-004): сервер — только хранение и пересылка.
Гарантия E2E обеспечивается тем, что в этом модуле:

 1. принимается ТОЛЬКО публичный ключевой материал — identity key, signed
    prekey, one-time prekeys. Приватные части не передаются ни одним полем
    ни одной схемы (см. schemas/e2ee.py);
 2. mailbox-payload'ы зашифрованы pairwise-сессиями клиентов (Double Ratchet);
    у сервера нет ключей к ним и нет кода, который пытался бы их разобрать —
    payload идёт из bytes в bytes;
 3. содержимое не логируется: в логи и аудит попадают только маршрутные
    метаданные (кто/кому/сколько), и так должно оставаться.

Любой будущий diff, добавляющий сюда расшифровку «для отладки» или логирование
payload/текста, ломает главный инвариант продукта — не делайте этого.
"""

import base64
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete as sa_delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth.deps import get_current_user
from app.core.rate_limit import e2ee_mailbox_limiter
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.e2ee import E2EEDevice, E2EEMailboxItem, E2EEOneTimePrekey
from app.models.membership import Membership
from app.models.user import User
from app.schemas.e2ee import (
    DeviceInfo,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    DevicesResponse,
    MailboxItemResponse,
    MailboxResponse,
    MailboxSendRequest,
    OneTimePrekey,
    PrekeyBundleResponse,
    PrekeyCountResponse,
    PrekeysPublishRequest,
    SignedPrekey,
)
from app.ws.manager import ws_manager

router = APIRouter(prefix="/e2ee", tags=["e2ee"])

# Сколько недоставленных блобов клиент забирает за один запрос.
MAILBOX_PAGE = 200


async def _require_shared_family(db: AsyncSession, a: UUID, b: UUID) -> None:
    """Публичные бандлы выдаются только внутри общих семей — иначе реестр
    устройств превращается в открытый каталог для харвестинга."""
    if a == b:
        return
    m_a = aliased(Membership)
    m_b = aliased(Membership)
    shared = await db.scalar(
        select(
            exists().where(
                m_a.user_id == a,
                m_b.user_id == b,
                m_a.family_id == m_b.family_id,
            )
        )
    )
    if not shared:
        raise HTTPException(status_code=404, detail="User not found")


async def _own_device(db: AsyncSession, user: User, device_id: int) -> E2EEDevice:
    device = await db.scalar(
        select(E2EEDevice).where(
            E2EEDevice.user_id == user.id, E2EEDevice.device_id == device_id
        )
    )
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


# ── Устройства и бандлы ──────────────────────────────────────────────────────


@router.post(
    "/devices/register",
    response_model=DeviceRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_device(
    body: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Публикация prekey-бандла нового устройства. Сервер выдаёт device_id."""
    next_id = (
        await db.scalar(
            select(func.coalesce(func.max(E2EEDevice.device_id), 0)).where(
                E2EEDevice.user_id == user.id
            )
        )
    ) + 1

    device = E2EEDevice(
        user_id=user.id,
        device_id=next_id,
        registration_id=body.registration_id,
        identity_key=base64.b64decode(body.identity_key),
        signed_prekey_id=body.signed_prekey.id,
        signed_prekey=base64.b64decode(body.signed_prekey.public_key),
        signed_prekey_signature=base64.b64decode(body.signed_prekey.signature),
    )
    db.add(device)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Гонка двух одновременных регистраций одного пользователя.
        raise HTTPException(status_code=409, detail="Retry device registration") from exc

    for pk in body.one_time_prekeys:
        db.add(
            E2EEOneTimePrekey(
                device_pk=device.id,
                key_id=pk.id,
                public_key=base64.b64decode(pk.public_key),
            )
        )
    await db.commit()
    return DeviceRegisterResponse(user_id=user.id, device_id=next_id)


@router.get("/users/{user_id}/devices", response_model=DevicesResponse)
async def list_devices(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_shared_family(db, user.id, user_id)
    devices = (
        await db.scalars(
            select(E2EEDevice)
            .where(E2EEDevice.user_id == user_id)
            .order_by(E2EEDevice.device_id)
        )
    ).all()
    return DevicesResponse(
        devices=[
            DeviceInfo(device_id=d.device_id, registration_id=d.registration_id)
            for d in devices
        ]
    )


@router.get(
    "/users/{user_id}/devices/{device_id}/prekey-bundle",
    response_model=PrekeyBundleResponse,
)
async def get_prekey_bundle(
    user_id: UUID,
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Бандл для X3DH. Отдаёт только публичный материал; one-time prekey
    выдаётся ровно один раз (атомарный pop), его исчерпание — штатный режим."""
    await _require_shared_family(db, user.id, user_id)

    device = await db.scalar(
        select(E2EEDevice).where(
            E2EEDevice.user_id == user_id, E2EEDevice.device_id == device_id
        )
    )
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # SKIP LOCKED: два параллельных запроса бандла не получат один prekey.
    prekey_row = await db.scalar(
        select(E2EEOneTimePrekey)
        .where(E2EEOneTimePrekey.device_pk == device.id)
        .order_by(E2EEOneTimePrekey.key_id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    one_time: OneTimePrekey | None = None
    if prekey_row:
        one_time = OneTimePrekey(
            id=prekey_row.key_id,
            public_key=base64.b64encode(prekey_row.public_key).decode(),
        )
        await db.delete(prekey_row)
        await db.commit()

    return PrekeyBundleResponse(
        device_id=device.device_id,
        registration_id=device.registration_id,
        identity_key=base64.b64encode(device.identity_key).decode(),
        signed_prekey=SignedPrekey(
            id=device.signed_prekey_id,
            public_key=base64.b64encode(device.signed_prekey).decode(),
            signature=base64.b64encode(device.signed_prekey_signature).decode(),
        ),
        one_time_prekey=one_time,
    )


@router.post("/devices/{device_id}/prekeys", status_code=status.HTTP_204_NO_CONTENT)
async def publish_prekeys(
    device_id: int,
    body: PrekeysPublishRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Пополнение one-time prekeys — только для собственного устройства."""
    device = await _own_device(db, user, device_id)
    for pk in body.prekeys:
        db.add(
            E2EEOneTimePrekey(
                device_pk=device.id,
                key_id=pk.id,
                public_key=base64.b64decode(pk.public_key),
            )
        )
    try:
        await db.commit()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Duplicate prekey id") from exc


@router.get("/devices/{device_id}/prekeys/count", response_model=PrekeyCountResponse)
async def prekey_count(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    device = await _own_device(db, user, device_id)
    count = await db.scalar(
        select(func.count()).where(E2EEOneTimePrekey.device_pk == device.id)
    )
    return PrekeyCountResponse(count=count or 0)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Потеря/вывод устройства: бандл, prekeys и недоставленные блобы каскадно
    удаляются. История на устройстве и так нечитаема без его локальных ключей."""
    device = await _own_device(db, user, device_id)
    await db.delete(device)
    await db.commit()


# ── Mailbox ──────────────────────────────────────────────────────────────────


@router.post("/mailbox", status_code=status.HTTP_204_NO_CONTENT)
async def send_mailbox(
    body: MailboxSendRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Приём key-exchange блобов. Payload не разбирается и не логируется —
    сервер проверяет только маршрут: устройство существует, есть общая семья,
    chat_id (если указан) принадлежит семье отправителя."""
    if not await e2ee_mailbox_limiter.allow(str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов к mailbox. Попробуйте позже.",
        )

    sender_device = await db.scalar(
        select(E2EEDevice)
        .where(E2EEDevice.user_id == user.id)
        .order_by(E2EEDevice.device_id)
        .limit(1)
    )
    if not sender_device:
        raise HTTPException(status_code=409, detail="Register a device first")

    notified: set[UUID] = set()
    for item in body.items:
        await _require_shared_family(db, user.id, item.recipient_user_id)

        recipient = await db.scalar(
            select(E2EEDevice).where(
                E2EEDevice.user_id == item.recipient_user_id,
                E2EEDevice.device_id == item.recipient_device_id,
            )
        )
        if not recipient:
            raise HTTPException(
                status_code=404,
                detail=f"Device {item.recipient_user_id}.{item.recipient_device_id} not found",
            )

        if item.chat_id is not None:
            chat_family = await db.scalar(
                select(Chat.family_id).where(Chat.id == item.chat_id)
            )
            if not chat_family:
                raise HTTPException(status_code=404, detail="Chat not found")
            is_member = await db.scalar(
                select(
                    exists().where(
                        Membership.family_id == chat_family,
                        Membership.user_id == user.id,
                    )
                )
            )
            if not is_member:
                raise HTTPException(status_code=403, detail="Not a member of chat family")

        db.add(
            E2EEMailboxItem(
                recipient_device_pk=recipient.id,
                sender_user_id=user.id,
                sender_device_id=sender_device.device_id,
                chat_id=item.chat_id,
                payload=base64.b64decode(item.payload),
            )
        )
        notified.add(item.recipient_user_id)

    await db.commit()

    # Онлайн-получатели забирают mailbox сразу; офлайн — при следующем входе.
    for uid in notified:
        await ws_manager.broadcast_to_user(uid, {"type": "e2ee_mailbox"})


@router.get("/mailbox", response_model=MailboxResponse)
async def fetch_mailbox(
    device_id: int = Query(ge=1),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    device = await _own_device(db, user, device_id)
    # +1 сверх страницы — чтобы понять, есть ли ещё, не считая всю очередь.
    rows = (
        await db.scalars(
            select(E2EEMailboxItem)
            .where(E2EEMailboxItem.recipient_device_pk == device.id)
            .order_by(E2EEMailboxItem.created_at)
            .limit(MAILBOX_PAGE + 1)
        )
    ).all()
    has_more = len(rows) > MAILBOX_PAGE
    items = rows[:MAILBOX_PAGE]
    return MailboxResponse(
        items=[
            MailboxItemResponse(
                id=i.id,
                sender_user_id=i.sender_user_id,
                sender_device_id=i.sender_device_id,
                chat_id=i.chat_id,
                payload=base64.b64encode(i.payload).decode(),
                created_at=i.created_at,
            )
            for i in items
        ],
        has_more=has_more,
    )


@router.delete("/mailbox/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def ack_mailbox(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ack после успешной обработки на клиенте — только тогда блоб удаляется,
    чтобы упавшая обработка не потеряла ключевой материал навсегда."""
    result = await db.execute(
        sa_delete(E2EEMailboxItem).where(
            E2EEMailboxItem.id == item_id,
            E2EEMailboxItem.recipient_device_pk.in_(
                select(E2EEDevice.id).where(E2EEDevice.user_id == user.id)
            ),
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Mailbox item not found")
