"""Капсулы времени. Серверный гейт: до ``unlock_at`` каждый видит только свои
записи; после — все. Создавать/наполнять может любой член семьи."""

from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.permissions import Perm, has_perm
from app.core.storage import storage
from app.core.uploads import ALLOWED_ATTACHMENT_EXT, DANGEROUS_CONTENT_TYPES
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.time_capsule import TimeCapsule, TimeCapsuleEntry
from app.models.user import User
from app.schemas.time_capsule import (
    CapsuleCreate,
    CapsuleDetail,
    CapsuleEntryCreateResult,
    CapsuleEntryOut,
    CapsuleRow,
)
from app.services.roles import effective_permissions

router = APIRouter(prefix="/families/{family_id}/capsules", tags=["time-capsules"])

_MAX_FILE_SIZE = 50 * 1024 * 1024
_MAX_FILES = 8


async def _require_member(family_id: uuid.UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")
    return m


def _validate_attachment_type(original_name: str, content_type: str | None) -> str:
    """Возвращает безопасное расширение или кидает 415 (как для сообщений)."""
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_ATTACHMENT_EXT:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Тип файла «{ext or original_name}» не поддерживается.",
        )
    declared = (content_type or "").split(";")[0].strip().lower()
    if declared in DANGEROUS_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Недопустимый тип содержимого вложения.",
        )
    return ext


def _attachment_kind(content_type: str | None, file_name: str) -> str:
    mime = (content_type or mimetypes.guess_type(file_name)[0] or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    return "file"


async def _aggregates(db: AsyncSession, capsule_ids: list[uuid.UUID], user_id: uuid.UUID):
    """Возвращает (total, contributors, your) по каждой капсуле."""
    total: dict[uuid.UUID, int] = {}
    contributors: dict[uuid.UUID, int] = {}
    your: dict[uuid.UUID, int] = {}
    if not capsule_ids:
        return total, contributors, your

    rows = (
        await db.execute(
            select(
                TimeCapsuleEntry.capsule_id,
                func.count(TimeCapsuleEntry.id),
                func.count(func.distinct(TimeCapsuleEntry.author_id)),
            )
            .where(TimeCapsuleEntry.capsule_id.in_(capsule_ids))
            .group_by(TimeCapsuleEntry.capsule_id)
        )
    ).all()
    for cid, cnt, contrib in rows:
        total[cid] = cnt
        contributors[cid] = contrib

    your_rows = (
        await db.execute(
            select(TimeCapsuleEntry.capsule_id, func.count(TimeCapsuleEntry.id))
            .where(
                TimeCapsuleEntry.capsule_id.in_(capsule_ids),
                TimeCapsuleEntry.author_id == user_id,
            )
            .group_by(TimeCapsuleEntry.capsule_id)
        )
    ).all()
    for cid, cnt in your_rows:
        your[cid] = cnt
    return total, contributors, your


def _row(c: TimeCapsule, now: datetime, total, contributors, your) -> CapsuleRow:
    return CapsuleRow(
        id=c.id,
        title=c.title,
        unlock_at=c.unlock_at,
        opened=now >= c.unlock_at,  # считаем от времени, не от флага
        created_by=c.created_by,
        created_at=c.created_at,
        total_entries=total.get(c.id, 0),
        contributors=contributors.get(c.id, 0),
        your_entries=your.get(c.id, 0),
    )


@router.get("", response_model=list[CapsuleRow])
async def list_capsules(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    now = datetime.now(timezone.utc)

    capsules = (
        await db.scalars(
            select(TimeCapsule)
            .where(TimeCapsule.family_id == family_id)
            .order_by(TimeCapsule.unlock_at.asc())
        )
    ).all()
    ids = [c.id for c in capsules]
    total, contributors, your = await _aggregates(db, ids, user.id)
    return [_row(c, now, total, contributors, your) for c in capsules]


@router.post("", response_model=CapsuleRow, status_code=status.HTTP_201_CREATED)
async def create_capsule(
    family_id: uuid.UUID,
    body: CapsuleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    now = datetime.now(timezone.utc)
    unlock_at = body.unlock_at
    if unlock_at.tzinfo is None:
        unlock_at = unlock_at.replace(tzinfo=timezone.utc)
    if unlock_at <= now:
        raise HTTPException(status_code=400, detail="Дата открытия должна быть в будущем")

    capsule = TimeCapsule(
        family_id=family_id,
        created_by=user.id,
        title=body.title,
        unlock_at=unlock_at,
    )
    db.add(capsule)
    await db.commit()
    await db.refresh(capsule)
    return _row(capsule, now, {}, {}, {})


async def _get_capsule(family_id: uuid.UUID, capsule_id: uuid.UUID, db: AsyncSession) -> TimeCapsule:
    capsule = await db.get(TimeCapsule, capsule_id)
    if not capsule or capsule.family_id != family_id:
        raise HTTPException(status_code=404, detail="Капсула не найдена")
    return capsule


@router.get("/{capsule_id}", response_model=CapsuleDetail)
async def get_capsule(
    family_id: uuid.UUID,
    capsule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    capsule = await _get_capsule(family_id, capsule_id, db)
    now = datetime.now(timezone.utc)
    sealed = now < capsule.unlock_at

    stmt = (
        select(TimeCapsuleEntry)
        .where(TimeCapsuleEntry.capsule_id == capsule_id)
        .options(selectinload(TimeCapsuleEntry.author))
        .order_by(TimeCapsuleEntry.created_at.asc())
    )
    if sealed:
        # Гейт: до открытия — только записи самого пользователя.
        stmt = stmt.where(TimeCapsuleEntry.author_id == user.id)
    entries = (await db.scalars(stmt)).all()

    total, contributors, your = await _aggregates(db, [capsule_id], user.id)
    row = _row(capsule, now, total, contributors, your)
    return CapsuleDetail(
        **row.model_dump(),
        entries=[
            CapsuleEntryOut(
                id=e.id,
                author_id=e.author_id,
                author_display_name=e.author.display_name if e.author else None,
                text=e.text,
                attachments=e.attachments or [],
                created_at=e.created_at,
            )
            for e in entries
        ],
    )


@router.post(
    "/{capsule_id}/entries",
    response_model=CapsuleEntryCreateResult,
    status_code=status.HTTP_201_CREATED,
)
async def add_entry(
    family_id: uuid.UUID,
    capsule_id: uuid.UUID,
    text: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    capsule = await _get_capsule(family_id, capsule_id, db)

    now = datetime.now(timezone.utc)
    if now >= capsule.unlock_at:
        raise HTTPException(status_code=400, detail="Капсула уже открыта — добавлять записи нельзя")

    body_text = (text or "").strip()
    clean_files = [f for f in files if f and f.filename]
    if not body_text and not clean_files:
        raise HTTPException(status_code=400, detail="Пустая запись")
    if len(body_text) > 4000:
        raise HTTPException(status_code=400, detail="Текст слишком длинный (макс 4000)")
    if len(clean_files) > _MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Слишком много файлов (макс {_MAX_FILES})")

    attachments: list[dict] = []
    for upload in clean_files:
        original_name = upload.filename or "file"
        ext = _validate_attachment_type(original_name, upload.content_type)
        payload = await upload.read()
        if len(payload) > _MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"Файл «{original_name}» слишком большой (макс 50 МБ)")
        stored_name = f"{uuid.uuid4()}{ext}"
        # Кладём под {family_id}/ — отдаётся существующим membership-гейтед роутом.
        try:
            await storage.save(f"{family_id}/{stored_name}", payload, upload.content_type)
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Не удалось сохранить вложение") from exc
        attachments.append(
            {
                "kind": _attachment_kind(upload.content_type, original_name),
                "url": f"/static/uploads/{family_id}/{stored_name}",
                "file_name": original_name,
                "file_size": len(payload),
                "content_type": upload.content_type,
            }
        )

    entry = TimeCapsuleEntry(
        capsule_id=capsule_id,
        author_id=user.id,
        text=body_text,
        attachments=attachments or None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return CapsuleEntryCreateResult(id=entry.id)


@router.delete("/{capsule_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    family_id: uuid.UUID,
    capsule_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    capsule = await _get_capsule(family_id, capsule_id, db)
    entry = await db.get(TimeCapsuleEntry, entry_id)
    if not entry or entry.capsule_id != capsule_id:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if entry.author_id != user.id:
        raise HTTPException(status_code=403, detail="Можно удалять только свои записи")
    if datetime.now(timezone.utc) >= capsule.unlock_at:
        raise HTTPException(status_code=400, detail="Капсула открыта — записи нельзя удалять")

    for item in entry.attachments or []:
        url = item.get("url")
        if url:
            await storage.delete_by_url(url)
    await db.delete(entry)
    await db.commit()


@router.delete("/{capsule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_capsule(
    family_id: uuid.UUID,
    capsule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    capsule = await _get_capsule(family_id, capsule_id, db)

    is_creator = capsule.created_by == user.id
    if not is_creator and m.role.value != "owner":
        bits = await effective_permissions(db, m.id)
        if not has_perm(bits, Perm.MANAGE_FAMILY):
            raise HTTPException(status_code=403, detail="Недостаточно прав для удаления капсулы")

    # Подчищаем вложения всех записей.
    entries = (
        await db.scalars(
            select(TimeCapsuleEntry).where(TimeCapsuleEntry.capsule_id == capsule_id)
        )
    ).all()
    for e in entries:
        for item in e.attachments or []:
            url = item.get("url")
            if url:
                await storage.delete_by_url(url)

    await db.delete(capsule)
    await db.commit()
