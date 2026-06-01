from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import Perm, has_perm
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.note import Note
from app.models.user import User
from app.schemas.notes import NoteCreate, NoteResponse, NoteUpdate
from app.services.audit import log_action
from app.services.roles import effective_permissions

family_router = APIRouter(prefix="/families/{family_id}/notes", tags=["notes"])
note_router = APIRouter(prefix="/notes", tags=["notes"])


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


async def _ensure_can_modify_note(note: Note, user: User, db: AsyncSession) -> Membership | None:
    """Проверка прав на правку/удаление заметки.

    Автор может всегда. Чужую заметку — только owner или MANAGE_NOTES (и только
    если заметка принадлежит семье). Возвращает membership актора, если он
    действует как модератор (для логирования), иначе None.
    """
    is_own = note.author_id == user.id

    # Заметка вне семьи (family_id NULL) — доступ строго у автора.
    if note.family_id is None:
        if not is_own:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Заметка вам не принадлежит",
            )
        return None

    m = await _require_member(note.family_id, user, db)
    if is_own:
        return None

    if m.role.value != "owner":
        bits = await effective_permissions(db, m.id)
        if not has_perm(bits, Perm.MANAGE_NOTES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для изменения чужих заметок",
            )
    return m  # действует как модератор


@family_router.get("", response_model=list[NoteResponse])
async def list_notes(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    notes = await db.scalars(
        select(Note)
        .where(
            Note.family_id == family_id,
            or_(
                Note.is_personal == False,  # noqa: E712
                Note.author_id == user.id,
            ),
        )
        .order_by(Note.updated_at.desc())
    )
    return list(notes.all())


@family_router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    family_id: UUID,
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    note = Note(
        family_id=family_id,
        author_id=user.id,
        title=body.title,
        content=body.content,
        is_personal=body.is_personal,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@note_router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    moderator = await _ensure_can_modify_note(note, user, db)

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    if body.is_personal is not None:
        note.is_personal = body.is_personal
    note.updated_at = datetime.now(timezone.utc)

    # Логируем только модерационную правку чужой заметки.
    if moderator is not None and note.family_id is not None:
        author = await db.get(User, note.author_id) if note.author_id else None
        await log_action(
            db,
            family_id=note.family_id,
            actor_id=user.id,
            action="note.edited_by_moderator",
            target_type="note",
            target_id=note.id,
            metadata={
                "title": note.title,
                "author_name": author.display_name if author else None,
            },
        )

    await db.commit()
    await db.refresh(note)
    return note


@note_router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = await db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    moderator = await _ensure_can_modify_note(note, user, db)

    if moderator is not None and note.family_id is not None:
        author = await db.get(User, note.author_id) if note.author_id else None
        await log_action(
            db,
            family_id=note.family_id,
            actor_id=user.id,
            action="note.deleted_by_moderator",
            target_type="note",
            target_id=note.id,
            metadata={
                "title": note.title,
                "author_name": author.display_name if author else None,
            },
        )

    await db.delete(note)
    await db.commit()
