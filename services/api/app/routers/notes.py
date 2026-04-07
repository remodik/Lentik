from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.note import Note
from app.models.user import User
from app.schemas.notes import NoteCreate, NoteResponse, NoteUpdate

family_router = APIRouter(prefix="/families/{family_id}/notes", tags=["notes"])
note_router = APIRouter(prefix="/notes", tags=["notes"])


async def _require_member(family_id: UUID, user: User, db: AsyncSession) -> None:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")


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
    if note.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author can edit this note")

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    if body.is_personal is not None:
        note.is_personal = body.is_personal
    note.updated_at = datetime.now(timezone.utc)

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
    if note.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author can delete this note")

    await db.delete(note)
    await db.commit()
