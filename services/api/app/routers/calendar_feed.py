"""Публичная iCal-подписка календаря семьи (read-only).

Доступ по неугадываемому токену (как private-ICS у Google): календарные
приложения не умеют слать cookie, поэтому эндпоинт без auth. Утечка URL =
доступ к календарю; перегенерация токена в настройках отзывает старый.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db.deps import get_db
from app.models.calendar_event import CalendarEvent
from app.models.family import Family

router = APIRouter(prefix="/calendar-feed", tags=["calendar-feed"])


def _escape(text: str | None) -> str:
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


@router.get("/{token}.ics")
async def calendar_feed(token: str, db: AsyncSession = Depends(get_db)):
    family = await db.scalar(select(Family).where(Family.calendar_feed_token == token))
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    events = (
        await db.scalars(
            select(CalendarEvent)
            .where(CalendarEvent.family_id == family.id)
            .order_by(CalendarEvent.starts_at.asc())
        )
    ).all()

    now = _utc(datetime.now(timezone.utc))
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Lentik//Family Calendar//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(family.name)}",
    ]
    for e in events:
        end = e.ends_at or e.starts_at
        lines += [
            "BEGIN:VEVENT",
            f"UID:{e.id}@lentik",
            f"DTSTAMP:{now}",
            f"DTSTART:{_utc(e.starts_at)}",
            f"DTEND:{_utc(end)}",
            f"SUMMARY:{_escape(e.title)}",
        ]
        if e.description:
            lines.append(f"DESCRIPTION:{_escape(e.description)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines) + "\r\n"
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="{family.id}.ics"',
            "Cache-Control": "private, max-age=300",
        },
    )
