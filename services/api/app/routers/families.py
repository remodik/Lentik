import secrets
import shutil
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.jwt import COOKIE_NAME, decode_access_token
from app.core.uploads import get_upload_root
from app.core.ws_security import is_allowed_ws_origin
from app.core.ws_tickets import ws_ticket_store
from app.db.deps import get_db
from app.db.session import AsyncSessionLocal
from app.models.chat import Chat
from app.models.family import Family
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.families import (
    ChangeMemberRoleRequest,
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
    TransferOwnershipRequest,
)
from app.core.permissions import Perm
from app.schemas.moderation import ModerationSettingsResponse, ModerationSettingsUpdate
from app.services.audit import log_action
from app.services.bans import is_banned_now
from app.services.family import create_family, require_membership, require_owner
from app.services.moderation import get_or_create_settings
from app.services.roles import require_family_perm
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families", tags=["families"])


# ─── Интеграции: iCal-подписка календаря (owner) ────────────────────────────


@router.get("/{family_id}/integrations")
async def get_integrations(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)
    family = await db.get(Family, family_id)
    return {"calendar_feed_token": family.calendar_feed_token if family else None}


@router.post("/{family_id}/integrations/calendar-feed")
async def enable_calendar_feed(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """(Пере)генерирует токен iCal-подписки — старый URL сразу перестаёт работать."""
    await require_owner(family_id, user, db)
    family = await db.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=404, detail="Family not found")
    family.calendar_feed_token = secrets.token_urlsafe(24)
    await db.commit()
    return {"calendar_feed_token": family.calendar_feed_token}


@router.delete("/{family_id}/integrations/calendar-feed", status_code=status.HTTP_204_NO_CONTENT)
async def disable_calendar_feed(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)
    family = await db.get(Family, family_id)
    if family is not None:
        family.calendar_feed_token = None
        await db.commit()


def _presence_payload(
    family_id: UUID,
    user_id: UUID,
    is_online: bool,
    last_seen_at: datetime | None,
) -> dict:
    return {
        "type": "presence_update",
        "family_id": str(family_id),
        "user_id": str(user_id),
        "is_online": is_online,
        "last_seen_at": last_seen_at.isoformat() if last_seen_at else None,
    }


def _family_to_detail_response(family: Family) -> FamilyDetailResponse:
    members = [
        FamilyMemberResponse(
            user_id=m.user_id,
            username=m.user.username,
            display_name=m.user.display_name,
            avatar_url=m.user.avatar_url,
            bio=m.user.bio,
            birthday=m.user.birthday,
            is_online=m.user.is_online,
            last_seen_at=m.user.last_seen_at,
            role=m.role,
            is_developer=m.user.is_developer,
            is_banned=m.user.is_banned,
            joined_at=m.created_at,
        )
        for m in family.memberships
    ]
    return FamilyDetailResponse(
        id=family.id,
        name=family.name,
        created_at=family.created_at,
        members=members,
    )


async def _migrate_owner_role(
    db: AsyncSession,
    *,
    family_id: UUID,
    from_membership_id: UUID,
    to_membership_id: UUID,
) -> None:
    """Переносит назначение FamilyRole со slug='owner' с одного участника на другого."""
    from app.models.role import FamilyRole, MemberRole

    owner_role = await db.scalar(
        select(FamilyRole).where(
            FamilyRole.family_id == family_id,
            FamilyRole.slug == "owner",
        )
    )
    if not owner_role:
        return

    # Снимаем owner-роль со старого владельца.
    await db.execute(
        sa_delete(MemberRole).where(
            MemberRole.membership_id == from_membership_id,
            MemberRole.role_id == owner_role.id,
        )
    )
    # Выдаём новому, если ещё нет.
    already = await db.scalar(
        select(MemberRole).where(
            MemberRole.membership_id == to_membership_id,
            MemberRole.role_id == owner_role.id,
        )
    )
    if not already:
        db.add(MemberRole(membership_id=to_membership_id, role_id=owner_role.id))


async def _transfer_ownership(
    family_id: UUID,
    target_user_id: UUID,
    current_owner_id: UUID,
    db: AsyncSession,
) -> tuple[Membership, FamilyDetailResponse]:
    current_owner_membership = await db.scalar(
        select(Membership)
        .where(
            Membership.family_id == family_id,
            Membership.user_id == current_owner_id,
        )
        .options(selectinload(Membership.user))
    )
    if not current_owner_membership:
        raise HTTPException(status_code=404, detail="Owner membership not found")

    target_membership = await db.scalar(
        select(Membership)
        .where(
            Membership.family_id == family_id,
            Membership.user_id == target_user_id,
        )
        .options(selectinload(Membership.user))
    )
    if not target_membership:
        raise HTTPException(status_code=404, detail="Member not found")

    async with db.begin_nested():
        current_owner_membership.role = Role.MEMBER
        target_membership.role = Role.OWNER
        # Переносим FamilyRole "owner" (с ADMINISTRATOR) со старого владельца
        # на нового, иначе старый сохранит админ-права через effective_permissions.
        await _migrate_owner_role(
            db,
            family_id=family_id,
            from_membership_id=current_owner_membership.id,
            to_membership_id=target_membership.id,
        )

    await log_action(
        db,
        family_id=family_id,
        actor_id=current_owner_id,
        action="family.ownership_transferred",
        target_type="user",
        target_id=target_user_id,
        metadata={
            "new_owner_name": target_membership.user.display_name,
            "new_owner_username": target_membership.user.username,
        },
    )

    await db.commit()

    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.memberships).selectinload(Membership.user))
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "ownership_transferred",
            "new_owner_id": str(target_user_id),
            "new_owner_name": target_membership.user.display_name,
            "prev_owner_id": str(current_owner_id),
        },
    )

    return target_membership, _family_to_detail_response(family)


@router.post("", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
async def create_family_endpoint(
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await create_family(name=body.name, owner=user, db=db)


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.memberships).selectinload(Membership.user))
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    return _family_to_detail_response(family)


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: UUID,
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await require_membership(family_id, user, db)
    await require_family_perm(db, m, Perm.MANAGE_FAMILY)

    family = await db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    prev_name = family.name
    family.name = body.name
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="family.renamed",
        target_type="family",
        target_id=family_id,
        metadata={"from": prev_name, "to": body.name},
    )
    await db.commit()
    await db.refresh(family)
    return family


@router.get("/{family_id}/moderation", response_model=ModerationSettingsResponse)
async def get_moderation(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await require_membership(family_id, user, db)
    await require_family_perm(db, m, Perm.MANAGE_FAMILY)

    settings = await get_or_create_settings(db, family_id)
    await db.commit()  # фиксируем возможное ленивое создание дефолтной строки
    return settings


@router.put("/{family_id}/moderation", response_model=ModerationSettingsResponse)
async def update_moderation(
    family_id: UUID,
    body: ModerationSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await require_membership(family_id, user, db)
    await require_family_perm(db, m, Perm.MANAGE_FAMILY)

    settings = await get_or_create_settings(db, family_id)

    diff: dict[str, dict] = {}
    for field in (
        "invite_max_active",
        "slowmode_default_seconds",
        "banned_words",
        "max_message_length",
    ):
        old = getattr(settings, field)
        new = getattr(body, field)
        if old != new:
            diff[field] = {"from": old, "to": new}
            setattr(settings, field, new)

    if diff:
        await log_action(
            db,
            family_id=family_id,
            actor_id=user.id,
            action="moderation.updated",
            target_type="family",
            target_id=family_id,
            metadata={"changes": diff},
        )
    await db.commit()
    await db.refresh(settings)
    return settings


@router.delete("/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Удаление пространства целиком — только у классического владельца.
    # Намеренно НЕ даём по MANAGE_FAMILY: это право для управления настройками,
    # а не для безвозвратного сноса всей семьи.
    await require_owner(family_id, user, db)

    family = await db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    # Собираем id чатов заранее: после удаления строк их уже не достать,
    # а нам нужно вычистить директории с вложениями с диска.
    chat_ids = list(
        (await db.scalars(select(Chat.id).where(Chat.family_id == family_id))).all()
    )

    # Каскадно удаляем семью. Все дочерние сущности (memberships, invites,
    # chats→messages→reactions/reads, channels→posts, gallery_items, expenses,
    # budget/calendar/notes/reminders/family_tree, family_roles→member_roles,
    # channel/chat overrides, audit_log) уходят по FK ON DELETE CASCADE на
    # уровне БД — все нужные внешние ключи объявлены с ondelete="CASCADE".
    await db.execute(sa_delete(Family).where(Family.id == family_id))
    await db.commit()

    # Файлы чистим только ПОСЛЕ успешного коммита, чтобы не потерять их,
    # если транзакция откатится. Все вложения семьи лежат под upload-root:
    #   <root>/<family_id>/                — галерея и прочие файлы семьи,
    #   <root>/chat_files/<chat_id>/       — вложения и голосовые сообщений.
    upload_root = get_upload_root()
    chat_files_root = upload_root / "chat_files"
    for chat_id in chat_ids:
        shutil.rmtree(chat_files_root / str(chat_id), ignore_errors=True)
    shutil.rmtree(upload_root / str(family_id), ignore_errors=True)

    # Журнал аудита здесь не ведём — запись всё равно ушла бы под каскад.
    # Вместо этого уведомляем клиентов, чтобы они сбросили активную семью,
    # и принудительно закрываем все WS-соединения удалённой семьи.
    await ws_manager.broadcast_to_family(
        family_id,
        {"type": "family_deleted", "family_id": str(family_id)},
    )
    await ws_manager.disconnect_family_all(family_id)


@router.delete("/{family_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def kick_member(
    family_id: UUID,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    actor = await require_membership(family_id, user, db)
    await require_family_perm(db, actor, Perm.KICK_MEMBERS)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself")

    target = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == member_id,
        )
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    # Защита: не-owner не может исключить владельца семьи.
    if target.role.value == "owner" and actor.role.value != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может исключать владельца")

    kicked_user_obj = await db.get(User, member_id)
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="family.member_kicked",
        target_type="user",
        target_id=member_id,
        metadata={
            "display_name": kicked_user_obj.display_name if kicked_user_obj else None,
            "username": kicked_user_obj.username if kicked_user_obj else None,
        },
    )

    await db.delete(target)
    await db.commit()

    kicked_user = await db.get(User, member_id)
    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "member_kicked",
            "user_id": str(member_id),
            "display_name": kicked_user.display_name if kicked_user else "Участник",
        },
    )
    await ws_manager.kick_user_from_family(family_id, member_id)


@router.patch("/{family_id}/members/{member_id}/role", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: UUID,
    member_id: UUID,
    body: ChangeMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if body.role == Role.OWNER:
        target_membership, _ = await _transfer_ownership(
            family_id=family_id,
            target_user_id=member_id,
            current_owner_id=user.id,
            db=db,
        )
        return FamilyMemberResponse(
            user_id=target_membership.user_id,
            username=target_membership.user.username,
            display_name=target_membership.user.display_name,
            avatar_url=target_membership.user.avatar_url,
            bio=target_membership.user.bio,
            birthday=target_membership.user.birthday,
            is_online=target_membership.user.is_online,
            last_seen_at=target_membership.user.last_seen_at,
            role=target_membership.role,
            joined_at=target_membership.created_at,
        )

    m = await db.scalar(
        select(Membership)
        .where(Membership.family_id == family_id, Membership.user_id == member_id)
        .options(selectinload(Membership.user))
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    m.role = body.role
    await db.commit()
    await db.refresh(m)

    return FamilyMemberResponse(
        user_id=m.user_id,
        username=m.user.username,
        display_name=m.user.display_name,
        avatar_url=m.user.avatar_url,
        bio=m.user.bio,
        birthday=m.user.birthday,
        is_online=m.user.is_online,
        last_seen_at=m.user.last_seen_at,
        role=m.role,
        joined_at=m.created_at,
    )


@router.post("/{family_id}/transfer-ownership", response_model=FamilyDetailResponse)
async def transfer_ownership(
    family_id: UUID,
    body: TransferOwnershipRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    if body.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot transfer ownership to yourself")

    _, updated_family = await _transfer_ownership(
        family_id=family_id,
        target_user_id=body.user_id,
        current_owner_id=user.id,
        db=db,
    )
    return updated_family


@router.websocket("/{family_id}/ws")
async def family_ws(
    websocket: WebSocket,
    family_id: UUID,
):
    # Defense-in-depth против CSWSH: чужой Origin не пускаем (L8).
    if not is_allowed_ws_origin(websocket):
        await websocket.close(code=4403)
        return

    token = websocket.cookies.get(COOKIE_NAME)
    decoded = decode_access_token(token) if token else None
    user_id = decoded[0] if decoded else None
    token_iat = decoded[1] if decoded else None
    if not user_id:
        ticket = websocket.query_params.get("ticket")
        if ticket:
            user_id = await ws_ticket_store.consume(ticket)
    if not user_id:
        await websocket.close(code=4001)
        return

    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.id == user_id))
        if not user:
            await websocket.close(code=4001)
            return

        if token_iat is not None and token_iat + timedelta(seconds=1) < user.password_changed_at:
            await websocket.close(code=4001)
            return

        # Глобальный бан: закрываем даже валидный ticket-путь (где revocation по
        # password_changed_at не срабатывает, т.к. token_iat is None).
        if is_banned_now(user):
            await websocket.close(code=4003)
            return

        m = await db.scalar(
            select(Membership).where(
                Membership.family_id == family_id,
                Membership.user_id == user.id,
            )
        )
        if not m:
            await websocket.close(code=4003)
            return

        was_online = user.is_online
        last_seen_at = user.last_seen_at

    await websocket.accept()
    await ws_manager.connect_family(family_id, websocket, user_id=user_id)
    became_online = await ws_manager.register_presence_connection(family_id, user_id, websocket)
    if became_online or not was_online:
        async with AsyncSessionLocal() as db:
            u = await db.get(User, user_id)
            if u:
                u.is_online = True
                await db.commit()
                last_seen_at = u.last_seen_at
        await ws_manager.broadcast_to_family(
            family_id,
            _presence_payload(
                family_id=family_id,
                user_id=user_id,
                is_online=True,
                last_seen_at=last_seen_at,
            ),
        )

    # Always send the caller's current presence state to avoid stale UI on connect races.
    await websocket.send_json(
        _presence_payload(
            family_id=family_id,
            user_id=user_id,
            is_online=True,
            last_seen_at=last_seen_at,
        )
    )

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect_family(family_id, websocket)
        became_offline = await ws_manager.unregister_presence_connection(
            family_id,
            user_id,
            websocket,
        )
        if became_offline:
            offline_seen = datetime.now(timezone.utc)
            async with AsyncSessionLocal() as db:
                u = await db.get(User, user_id)
                if u:
                    u.is_online = False
                    u.last_seen_at = offline_seen
                    await db.commit()
                    offline_seen = u.last_seen_at
            await ws_manager.broadcast_to_family(
                family_id,
                _presence_payload(
                    family_id=family_id,
                    user_id=user_id,
                    is_online=False,
                    last_seen_at=offline_seen,
                ),
            )
