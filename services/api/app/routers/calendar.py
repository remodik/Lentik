from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.calendar_event import CalendarEvent
from app.models.membership import Membership
from app.models.user import User
from app.schemas.calendar import (
    CalendarEventCreate, CalendarEventResponse, CalendarEventUpdate,
)
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families/{family_id}/calendar", tags=["calendar"])


async def _require_member(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")
    return m


def _to_response(event: CalendarEvent) -> CalendarEventResponse:
    return CalendarEventResponse(
        id=event.id,
        family_id=event.family_id,
        created_by=event.created_by,
        creator_name=event.creator.display_name if event.creator else None,
        title=event.title,
        description=event.description,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        color=event.color,
        created_at=event.created_at,
    )


@router.get("", response_model=list[CalendarEventResponse])
async def list_events(
    family_id: UUID,
    year: int | None = None,
    month: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    query = (
        select(CalendarEvent)
        .where(CalendarEvent.family_id == family_id)
        .options(selectinload(CalendarEvent.creator))
        .order_by(CalendarEvent.starts_at)
    )

    if year and month:
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        month_end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        query = query.where(
            CalendarEvent.starts_at >= month_start,
            CalendarEvent.starts_at <= month_end,
        )

    result = await db.scalars(query)
    return [_to_response(e) for e in result.all()]


@router.post("", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    family_id: UUID,
    body: CalendarEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    event = CalendarEvent(
        family_id=family_id,
        created_by=user.id,
        title=body.title,
        description=body.description,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        color=body.color,
    )
    db.add(event)
    await db.flush()
    await db.refresh(event, ["creator"])
    await db.commit()

    resp = _to_response(event)

    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "calendar_event_created",
            "event_id": str(event.id),
            "title": event.title,
            "starts_at": event.starts_at.isoformat(),
            "creator_name": user.display_name,
        },
    )

    return resp


@router.patch("/{event_id}", response_model=CalendarEventResponse)
async def update_event(
    family_id: UUID,
    event_id: UUID,
    body: CalendarEventUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    event = await db.scalar(
        select(CalendarEvent)
        .where(CalendarEvent.id == event_id, CalendarEvent.family_id == family_id)
        .options(selectinload(CalendarEvent.creator))
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only creator can edit")

    if body.title is not None: event.title = body.title
    if body.description is not None: event.description = body.description
    if body.starts_at is not None: event.starts_at = body.starts_at
    if body.ends_at is not None: event.ends_at = body.ends_at
    if body.color is not None: event.color = body.color

    await db.commit()
    await db.refresh(event, ["creator"])
    return _to_response(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    family_id: UUID,
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)

    event = await db.scalar(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.family_id == family_id,
        )
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.created_by != user.id and m.role != "owner":
        raise HTTPException(status_code=403, detail="Not allowed")

    await db.delete(event)
    await db.commit()