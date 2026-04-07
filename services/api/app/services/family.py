from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.membership import Membership, Role
from app.models.user import User

FREE_FAMILY_LIMIT = 5


async def create_family(name: str, owner: User, db: AsyncSession) -> Family:
    owned_families = await db.scalar(
        select(func.count(Membership.id)).where(
            Membership.user_id == owner.id,
            Membership.role == Role.OWNER,
        )
    )
    if (owned_families or 0) >= FREE_FAMILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Бесплатный план позволяет создать до 5 семей. "
                "Оформи подписку, чтобы добавить больше."
            ),
        )

    family = Family(name=name)
    db.add(family)
    await db.flush()

    membership = Membership(family_id=family.id, user_id=owner.id, role=Role.OWNER)
    db.add(membership)

    await db.commit()
    await db.refresh(family)
    return family


async def require_membership(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a family member",
        )
    return m


async def require_owner(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await require_membership(family_id, user, db)
    if m.role != Role.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can do this",
        )
    return m
