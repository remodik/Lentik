from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.family import Family
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.families import (
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
)

router = APIRouter(prefix="/families", tags=["families"])


async def _require_membership(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")
    return m


async def _require_owner(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await _require_membership(family_id, user, db)
    if m.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can do this")
    return m


@router.post("", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
async def create_family(
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    family = Family(name=body.name)
    db.add(family)
    await db.flush()

    membership = Membership(family_id=family.id, user_id=user.id, role=Role.OWNER)
    db.add(membership)

    await db.commit()
    await db.refresh(family)
    return family


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_membership(family_id, user, db)

    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.memberships).selectinload(Membership.user))
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    members = [
        FamilyMemberResponse(
            user_id=m.user_id,
            username=m.user.username,
            avatar_url=m.user.avatar_url,
            role=m.role,
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


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: UUID,
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_owner(family_id, user, db)

    family = await db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    family.name = body.name
    await db.commit()
    await db.refresh(family)
    return family


@router.delete("/{family_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def kick_member(
    family_id: UUID,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_owner(family_id, user, db)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself")

    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == member_id,
        )
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(m)
    await db.commit()


@router.patch("/{family_id}/members/{member_id}/role", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: UUID,
    member_id: UUID,
    role: Role,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_owner(family_id, user, db)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    m = await db.scalar(
        select(Membership)
        .where(Membership.family_id == family_id, Membership.user_id == member_id)
        .options(selectinload(Membership.user))
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    m.role = role
    await db.commit()
    await db.refresh(m)

    return FamilyMemberResponse(
        user_id=m.user_id,
        username=m.user.username,
        avatar_url=m.user.avatar_url,
        role=m.role,
        joined_at=m.created_at,
    )