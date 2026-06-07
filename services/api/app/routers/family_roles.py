"""CRUD ролей внутри семьи + назначение участникам."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import (
    PERM_GROUPS,
    PERM_MASK,
    Perm,
    has_perm,
    permission_labels,
    unknown_bits,
)
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.role import FamilyRole, MemberRole
from app.models.user import User
from app.schemas.role import (
    MemberRoleAssignment,
    PermissionBitInfo,
    PermissionGroupInfo,
    PermissionsCatalogResponse,
    RoleCreateRequest,
    RoleReorderRequest,
    RoleResponse,
    RoleUpdateRequest,
)
from app.services.audit import log_action
from app.services.family import require_membership
from app.services.roles import effective_permissions

router = APIRouter(prefix="/families/{family_id}", tags=["roles"])


# ─────────────────────────────────────────────────────────────────────────────
# Хелперы
# ─────────────────────────────────────────────────────────────────────────────


async def _require_manage_roles(
    family_id: UUID, user: User, db: AsyncSession
) -> Membership:
    """Доступ к управлению ролями: либо owner-роль семьи, либо MANAGE_ROLES."""
    membership = await require_membership(family_id, user, db)
    if membership.role.value == "owner":
        return membership
    bits = await effective_permissions(db, membership.id)
    if has_perm(bits, Perm.MANAGE_ROLES):
        return membership
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Недостаточно прав для управления ролями",
    )


async def _ensure_can_grant_perms(
    db: AsyncSession,
    membership: Membership,
    new_perms: int,
    *,
    prev_perms: int = 0,
) -> None:
    """Анти-эскалация: не-владелец не может ВКЛЮЧИТЬ в роль биты, которыми сам
    не обладает (CWE-269). Биты, уже бывшие у роли (prev_perms) и не трогаемые,
    допустимы. Бит ADMINISTRATOR валидируется отдельно (owner-only) в вызывающем
    коде, здесь исключается из сообщения. Также отсекаем неизвестные биты.
    """
    if unknown_bits(new_perms):
        raise HTTPException(
            status_code=400,
            detail="В правах роли переданы неизвестные биты",
        )

    if membership.role.value == "owner":
        return
    actor_bits = await effective_permissions(db, membership.id)
    if actor_bits & int(Perm.ADMINISTRATOR):
        return

    # Только реально добавляемые битами (которых не было в роли) подлежат проверке.
    added = new_perms & ~prev_perms
    missing = added & ~actor_bits & PERM_MASK & ~int(Perm.ADMINISTRATOR)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Нельзя выдать роли права, которых нет у вас: "
                + ", ".join(permission_labels(missing))
            ),
        )


def _role_to_response(role: FamilyRole, member_count: int) -> RoleResponse:
    return RoleResponse(
        id=role.id,
        family_id=role.family_id,
        slug=role.slug,
        name=role.name,
        color=role.color,
        priority=role.priority,
        permissions=role.permissions,
        is_preset=role.is_preset,
        is_everyone=role.is_everyone,
        is_system=role.is_system,
        created_at=role.created_at,
        member_count=member_count,
    )


async def _list_roles_with_counts(
    db: AsyncSession,
    family_id: UUID,
) -> list[RoleResponse]:
    roles = (
        await db.scalars(
            select(FamilyRole)
            .where(FamilyRole.family_id == family_id)
            .order_by(FamilyRole.priority.asc(), FamilyRole.name.asc())
        )
    ).all()

    counts = dict(
        (
            await db.execute(
                select(MemberRole.role_id, func.count(MemberRole.id))
                .join(FamilyRole, FamilyRole.id == MemberRole.role_id)
                .where(FamilyRole.family_id == family_id)
                .group_by(MemberRole.role_id)
            )
        ).all()
    )

    return [_role_to_response(r, counts.get(r.id, 0)) for r in roles]


# ─────────────────────────────────────────────────────────────────────────────
# Эндпоинты
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/me/permissions")
async def get_my_effective_permissions(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Возвращает текущему пользователю его effective-биты:
      * base — права на уровне семьи (OR ролей);
      * chats: { chat_id → bits } и channels: { channel_id → bits } с учётом overrides;
      * is_administrator: шорткат — есть ли ADMINISTRATOR-бит или owner-membership.
    """
    from app.models.chat import Chat
    from app.models.channel import Channel
    from app.services.roles import (
        effective_chat_permissions,
        effective_channel_permissions,
    )

    membership = await require_membership(family_id, user, db)
    is_developer = bool(user.is_developer)
    is_owner = membership.role.value == "owner"
    base = await effective_permissions(db, membership.id)

    # Шорткат — owner и разработчик (god-mode) получают все биты.
    god_mode = is_owner or is_developer
    if god_mode:
        base = base | int(Perm.ADMINISTRATOR)

    chat_ids = (
        await db.scalars(
            select(Chat.id).where(Chat.family_id == family_id)
        )
    ).all()
    channel_ids = (
        await db.scalars(
            select(Channel.id).where(Channel.family_id == family_id)
        )
    ).all()

    chat_perms: dict[str, int] = {}
    channel_perms: dict[str, int] = {}
    for cid in chat_ids:
        if god_mode:
            chat_perms[str(cid)] = base
        else:
            chat_perms[str(cid)] = await effective_chat_permissions(db, membership.id, cid)
    for cid in channel_ids:
        if god_mode:
            channel_perms[str(cid)] = base
        else:
            channel_perms[str(cid)] = await effective_channel_permissions(db, membership.id, cid)

    return {
        "base": base,
        "is_owner": is_owner,
        "is_developer": is_developer,
        "is_administrator": bool(base & int(Perm.ADMINISTRATOR)),
        "chats": chat_perms,
        "channels": channel_perms,
    }


@router.get("/permissions/catalog", response_model=PermissionsCatalogResponse)
async def get_permissions_catalog(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Возвращает структуру битов для UI (без обращения к БД, но требует членства)."""
    await require_membership(family_id, user, db)
    groups: list[PermissionGroupInfo] = []
    for group_name, perms in PERM_GROUPS:
        groups.append(
            PermissionGroupInfo(
                name=group_name,
                perms=[
                    PermissionBitInfo(bit=int(p), label=label, description=desc)
                    for (p, label, desc) in perms
                ],
            )
        )
    return PermissionsCatalogResponse(groups=groups)


@router.get("/members/roles", response_model=dict[str, list[str]])
async def list_members_roles(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Возвращает map { user_id (str) → [role_id (str), ...] } для всех участников.

    Используется UI'ем, чтобы одним запросом показать чипы ролей у всех.
    """
    await require_membership(family_id, user, db)

    rows = (
        await db.execute(
            select(Membership.user_id, FamilyRole.id)
            .join(MemberRole, MemberRole.membership_id == Membership.id)
            .join(FamilyRole, FamilyRole.id == MemberRole.role_id)
            .where(Membership.family_id == family_id)
        )
    ).all()
    out: dict[str, list[str]] = {}
    for user_id, role_id in rows:
        out.setdefault(str(user_id), []).append(str(role_id))
    return out


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    return await _list_roles_with_counts(db, family_id)


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    family_id: UUID,
    body: RoleCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_manage_roles(family_id, user, db)

    # Не даём пользователю выдать ADMINISTRATOR обычной роли, если он сам не админ
    # (или не классический owner).
    if (body.permissions & int(Perm.ADMINISTRATOR)) and membership.role.value != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только владелец может выдавать роль администратора",
        )
    # Анти-эскалация: нельзя создать роль с правами выше собственных.
    await _ensure_can_grant_perms(db, membership, body.permissions)

    role = FamilyRole(
        family_id=family_id,
        slug=None,
        name=body.name,
        color=body.color,
        priority=body.priority,
        permissions=body.permissions,
        is_preset=False,
        is_everyone=False,
        is_system=False,
    )
    db.add(role)
    await db.flush()
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="role.created",
        target_type="role",
        target_id=role.id,
        metadata={"name": role.name, "permissions": role.permissions},
    )
    await db.commit()
    await db.refresh(role)
    return _role_to_response(role, 0)


@router.put("/roles/reorder", response_model=list[RoleResponse])
async def reorder_roles(
    family_id: UUID,
    body: RoleReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage_roles(family_id, user, db)

    roles = (
        await db.scalars(
            select(FamilyRole)
            .where(FamilyRole.family_id == family_id)
            .order_by(FamilyRole.priority.asc(), FamilyRole.name.asc())
        )
    ).all()

    owner_role = next((r for r in roles if r.slug == "owner"), None)
    everyone_role = next((r for r in roles if r.is_everyone), None)
    if not owner_role or not everyone_role:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Системные роли семьи не найдены",
        )

    ordered_ids = body.ordered_ids
    ordered_set = set(ordered_ids)
    if len(ordered_set) != len(ordered_ids):
        raise HTTPException(status_code=400, detail="В списке ролей есть дубликаты")

    fixed_ids = {owner_role.id, everyone_role.id}
    if ordered_set & fixed_ids:
        raise HTTPException(
            status_code=400,
            detail="Владелец и @everyone закреплены и не участвуют в сортировке",
        )

    movable_roles = [r for r in roles if r.id not in fixed_ids]
    expected_ids = {r.id for r in movable_roles}
    if ordered_set != expected_ids:
        raise HTTPException(
            status_code=400,
            detail="Передайте все роли семьи кроме владельца и @everyone",
        )

    roles_by_id = {r.id: r for r in movable_roles}
    ordered_roles = [roles_by_id[role_id] for role_id in ordered_ids]

    owner_role.priority = 0
    for index, role in enumerate(ordered_roles, start=1):
        role.priority = index * 10
    everyone_role.priority = max(100, (len(ordered_roles) + 1) * 10)

    final_order = [owner_role, *ordered_roles, everyone_role]
    await db.flush()
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="role.reordered",
        target_type="role",
        metadata={"order": [role.name for role in final_order]},
    )
    await db.commit()
    return await _list_roles_with_counts(db, family_id)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    family_id: UUID,
    role_id: UUID,
    body: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_manage_roles(family_id, user, db)

    role = await db.get(FamilyRole, role_id)
    if not role or role.family_id != family_id:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    # Системные роли (Owner, @everyone) — нельзя переименовывать и менять приоритет.
    if role.is_system and (body.name is not None or body.priority is not None):
        raise HTTPException(
            status_code=400,
            detail="Системную роль нельзя переименовывать или менять её приоритет",
        )

    # Только владелец может менять права роли «owner» или давать ADMINISTRATOR.
    if body.permissions is not None:
        wants_admin = body.permissions & int(Perm.ADMINISTRATOR)
        had_admin = role.permissions & int(Perm.ADMINISTRATOR)
        if (wants_admin or had_admin) and membership.role.value != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Только владелец может изменять права администратора",
            )
        # Анти-эскалация: новые биты должны быть подмножеством прав актора.
        await _ensure_can_grant_perms(
            db, membership, body.permissions, prev_perms=role.permissions
        )

    changes: dict[str, dict] = {}
    perm_diff: dict[str, list[str]] | None = None
    if body.name is not None and body.name != role.name:
        changes["name"] = {"from": role.name, "to": body.name}
        role.name = body.name
    if body.color is not None and body.color != role.color:
        changes["color"] = {"from": role.color, "to": body.color}
        role.color = body.color
    if body.priority is not None and body.priority != role.priority:
        changes["priority"] = {"from": role.priority, "to": body.priority}
        role.priority = body.priority
    if body.permissions is not None and body.permissions != role.permissions:
        from app.core.permissions import diff_permissions

        perm_diff = diff_permissions(role.permissions, body.permissions)
        role.permissions = body.permissions

    if changes or perm_diff:
        meta: dict = {"name": role.name}
        if changes:
            meta["changes"] = changes
        if perm_diff:
            meta["permissions"] = perm_diff
        await log_action(
            db,
            family_id=family_id,
            actor_id=user.id,
            action="role.updated",
            target_type="role",
            target_id=role.id,
            metadata=meta,
        )

    await db.commit()
    await db.refresh(role)

    member_count = await db.scalar(
        select(func.count(MemberRole.id)).where(MemberRole.role_id == role.id)
    )
    return _role_to_response(role, member_count or 0)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    family_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage_roles(family_id, user, db)

    role = await db.get(FamilyRole, role_id)
    if not role or role.family_id != family_id:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Системную роль удалить нельзя")

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="role.deleted",
        target_type="role",
        target_id=role.id,
        metadata={"name": role.name},
    )
    await db.delete(role)
    await db.commit()


@router.put(
    "/members/{member_id}/roles",
    response_model=list[RoleResponse],
)
async def set_member_roles(
    family_id: UUID,
    member_id: UUID,
    body: MemberRoleAssignment,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Заменяет полный набор ролей участника. owner-роль и @everyone не трогаются."""
    actor = await _require_manage_roles(family_id, user, db)

    target_membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == member_id,
        )
    )
    if not target_membership:
        raise HTTPException(status_code=404, detail="Участник не найден")

    # Снимок прошлых ролей (без @everyone) для диффа в журнал.
    prev_roles = (
        await db.scalars(
            select(FamilyRole)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(
                MemberRole.membership_id == target_membership.id,
                FamilyRole.is_everyone.is_(False),
            )
        )
    ).all()
    prev_names = {r.id: r.name for r in prev_roles}

    requested_roles = (
        await db.scalars(
            select(FamilyRole).where(
                FamilyRole.id.in_(body.role_ids),
                FamilyRole.family_id == family_id,
            )
        )
    ).all()
    if len(requested_roles) != len(set(body.role_ids)):
        raise HTTPException(status_code=400, detail="Часть ролей не принадлежит этой семье")

    # Защиты:
    #  * owner-роль может выдавать только текущий владелец;
    #  * ADMINISTRATOR-роли — только владелец;
    #  * нельзя снять owner-роль с владельца кому-то другому.
    # Анти-эскалация (CWE-269): не-владелец не может назначить участнику роль с
    # правами, которых у него самого нет. Проверяем только ВНОВЬ добавляемые роли,
    # чтобы не блокировать пере-сохранение уже имеющихся у участника назначений.
    actor_is_admin = actor.role.value == "owner"
    actor_bits = 0
    if not actor_is_admin:
        actor_bits = await effective_permissions(db, actor.id)
        actor_is_admin = bool(actor_bits & int(Perm.ADMINISTRATOR))

    for r in requested_roles:
        if r.slug == "owner" and actor.role.value != "owner":
            raise HTTPException(
                status_code=403, detail="Только владелец может выдавать роль владельца"
            )
        if (r.permissions & int(Perm.ADMINISTRATOR)) and actor.role.value != "owner":
            raise HTTPException(
                status_code=403, detail="Только владелец может выдавать роли с правом администратора"
            )
        is_newly_added = not r.is_everyone and r.id not in prev_names
        if is_newly_added and not actor_is_admin:
            missing = r.permissions & ~actor_bits & PERM_MASK & ~int(Perm.ADMINISTRATOR)
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Нельзя назначить роль «{r.name}»: она даёт права, которых нет у вас: "
                        + ", ".join(permission_labels(missing))
                    ),
                )

    # Чистим всё, кроме @everyone (его не убираем).
    await db.execute(
        delete(MemberRole)
        .where(MemberRole.membership_id == target_membership.id)
        .where(
            MemberRole.role_id.in_(
                select(FamilyRole.id).where(
                    FamilyRole.family_id == family_id,
                    FamilyRole.is_everyone.is_(False),
                )
            )
        )
    )
    # Гарантируем, что @everyone присутствует.
    everyone = await db.scalar(
        select(FamilyRole).where(
            FamilyRole.family_id == family_id,
            FamilyRole.is_everyone.is_(True),
        )
    )
    if everyone:
        present = await db.scalar(
            select(MemberRole).where(
                MemberRole.membership_id == target_membership.id,
                MemberRole.role_id == everyone.id,
            )
        )
        if not present:
            db.add(MemberRole(membership_id=target_membership.id, role_id=everyone.id))

    for r in requested_roles:
        if r.is_everyone:
            continue
        db.add(MemberRole(membership_id=target_membership.id, role_id=r.id))

    # Дифф: что добавили, что сняли (без @everyone).
    new_assignable = {r.id: r.name for r in requested_roles if not r.is_everyone}
    added = [name for rid, name in new_assignable.items() if rid not in prev_names]
    removed = [name for rid, name in prev_names.items() if rid not in new_assignable]

    target_user = await db.get(User, member_id)
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="role.assigned",
        target_type="user",
        target_id=member_id,
        metadata={
            "member_name": target_user.display_name if target_user else None,
            "role_names": list(new_assignable.values()),
            "added": added,
            "removed": removed,
        },
    )

    await db.commit()

    # Возвращаем актуальный набор ролей участника.
    out_roles = (
        await db.scalars(
            select(FamilyRole)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(MemberRole.membership_id == target_membership.id)
            .order_by(FamilyRole.priority.asc())
        )
    ).all()
    counts = dict(
        (
            await db.execute(
                select(MemberRole.role_id, func.count(MemberRole.id))
                .where(MemberRole.role_id.in_([r.id for r in out_roles]))
                .group_by(MemberRole.role_id)
            )
        ).all()
    )
    return [_role_to_response(r, counts.get(r.id, 0)) for r in out_roles]


@router.get(
    "/members/{member_id}/roles",
    response_model=list[RoleResponse],
)
async def get_member_roles(
    family_id: UUID,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    target_membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == member_id,
        )
    )
    if not target_membership:
        raise HTTPException(status_code=404, detail="Участник не найден")

    roles = (
        await db.scalars(
            select(FamilyRole)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(MemberRole.membership_id == target_membership.id)
            .order_by(FamilyRole.priority.asc())
        )
    ).all()
    counts = dict(
        (
            await db.execute(
                select(MemberRole.role_id, func.count(MemberRole.id))
                .where(MemberRole.role_id.in_([r.id for r in roles]))
                .group_by(MemberRole.role_id)
            )
        ).all()
    )
    return [_role_to_response(r, counts.get(r.id, 0)) for r in roles]
