import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy import case, delete, func, inspect as sa_inspect, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.uploads import get_upload_root
from app.core.jwt import COOKIE_NAME, decode_access_token
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.message import Message
from app.models.message_read import MessageRead
from app.models.reaction import MessageReaction
from app.models.user import User
from app.schemas.chats import (
    EMOJI_PATTERN,
    ChatCreate,
    ChatPinRequest,
    ChatResponse,
    ChatUpdate,
    MessageCreate,
    MessageSearchResult,
    MessageReadRequest,
    MessageReactionCreate,
    MessageResponse,
    MessageUpdate,
    PinnedMessagePreview,
    ReaderInfo,
    ReactionSummary,
)
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families/{family_id}/chats", tags=["chats"])

MENTION_RE = re.compile(r"@([\w_]+)")
EMOJI_RE = re.compile(EMOJI_PATTERN)
CHAT_UPLOAD_DIR = get_upload_root() / "chat_files"
MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024
MAX_ATTACHMENTS_PER_MESSAGE = 8
MESSAGE_SEARCH_LIMIT = 30


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


def _compact_preview_text(text: str) -> str:
    compact = " ".join(text.split())
    if not compact:
        return "Без текста"
    if len(compact) <= 120:
        return compact
    return f"{compact[:120]}…"


def _escape_like(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def _search_snippet(text: str, query: str, has_attachments: bool, max_len: int = 120) -> str:
    compact = " ".join(text.split())
    if not compact:
        return "Сообщение с вложением" if has_attachments else "Без текста"

    normalized_query = " ".join(query.split()).lower()
    if not normalized_query:
        if len(compact) <= max_len:
            return compact
        return f"{compact[:max_len]}…"

    compact_lower = compact.lower()
    index = compact_lower.find(normalized_query)
    if index == -1:
        if len(compact) <= max_len:
            return compact
        return f"{compact[:max_len]}…"

    start = max(0, index - 40)
    end = min(len(compact), index + len(normalized_query) + 56)
    snippet = compact[start:end]
    if start > 0:
        snippet = f"…{snippet}"
    if end < len(compact):
        snippet = f"{snippet}…"
    return snippet


def _chat_to_response(chat: Chat) -> ChatResponse:
    pinned_message = chat.pinned_message if chat.pinned_message_id else None
    if pinned_message and pinned_message.chat_id != chat.id:
        pinned_message = None

    pinned_preview: PinnedMessagePreview | None = None
    if pinned_message:
        pinned_preview = PinnedMessagePreview(
            preview_text=_compact_preview_text(pinned_message.text),
            author_display_name=(
                pinned_message.author.display_name if pinned_message.author else "Участник"
            ),
            created_at=pinned_message.created_at,
        )

    return ChatResponse(
        id=chat.id,
        family_id=chat.family_id,
        name=chat.name,
        description=chat.description,
        slow_mode_seconds=chat.slow_mode_seconds,
        is_18plus=chat.is_18plus,
        created_by=chat.created_by,
        pinned_message_id=chat.pinned_message_id,
        pinned_message=pinned_preview,
        created_at=chat.created_at,
    )


def _chat_pin_update_payload(chat: Chat) -> dict:
    response = _chat_to_response(chat)
    return {
        "type": "chat_pin_updated",
        "chat_id": str(chat.id),
        "pinned_message_id": (
            str(response.pinned_message_id) if response.pinned_message_id else None
        ),
        "pinned_message": (
            response.pinned_message.model_dump(mode="json")
            if response.pinned_message
            else None
        ),
    }


async def _load_chat_with_pin(
    db: AsyncSession,
    family_id: UUID,
    chat_id: UUID,
) -> Chat | None:
    return await db.scalar(
        select(Chat)
        .where(Chat.id == chat_id, Chat.family_id == family_id)
        .options(selectinload(Chat.pinned_message).selectinload(Message.author))
    )


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


def _user_age_years(user: User) -> int | None:
    """Возраст пользователя в полных годах. Возвращает None, если birthday не задан."""
    if not user.birthday:
        return None
    today = datetime.now(timezone.utc).date()
    bd = user.birthday
    age = today.year - bd.year - (
        (today.month, today.day) < (bd.month, bd.day)
    )
    return max(0, age)


def _ensure_age_gate(chat: Chat, user: User) -> None:
    """Проверка возрастного ограничения 18+. Бросает 403 если не подходит."""
    if not chat.is_18plus:
        return
    age = _user_age_years(user)
    if age is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Этот чат — 18+. Заполните дату рождения в профиле.",
        )
    if age < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Этот чат — 18+. Доступ запрещён.",
        )


async def _enforce_slow_mode(
    chat: Chat,
    user: User,
    membership: Membership,
    db: AsyncSession,
) -> None:
    """Возвращает 429 если slow-mode активен и от пользователя недавно было сообщение.

    Владелец семьи slow-mode игнорирует.
    """
    if not chat.slow_mode_seconds or chat.slow_mode_seconds <= 0:
        return
    if membership.role == "owner":
        return

    last = await db.scalar(
        select(Message)
        .where(Message.chat_id == chat.id, Message.author_id == user.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    if not last:
        return

    now = datetime.now(timezone.utc)
    elapsed = (now - last.created_at).total_seconds()
    remaining = int(chat.slow_mode_seconds - elapsed)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Медленный режим: подождите ещё {remaining} с перед следующим сообщением."
            ),
            headers={"Retry-After": str(remaining)},
        )


def _parse_mentions(text: str) -> list[str]:
    return list(set(MENTION_RE.findall(text)))


def _attachment_kind(content_type: str | None, file_name: str) -> str:
    guessed = mimetypes.guess_type(file_name)[0]
    mime = (content_type or guessed or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    return "file"


def _reaction_summaries(msg: Message) -> list[ReactionSummary]:
    state = sa_inspect(msg)
    if "reactions" in state.unloaded:
        return []

    grouped: dict[str, list[str]] = {}
    for reaction in msg.reactions or []:
        grouped.setdefault(reaction.emoji, []).append(str(reaction.user_id))

    return [
        ReactionSummary(emoji=emoji, count=len(user_ids), user_ids=user_ids)
        for emoji, user_ids in grouped.items()
    ]


def _reader_infos(msg: Message) -> list[ReaderInfo]:
    state = sa_inspect(msg)
    if "reads" in state.unloaded:
        return []

    reads = sorted((msg.reads or []), key=lambda item: item.read_at)
    readers: list[ReaderInfo] = []
    for read in reads:
        read_state = sa_inspect(read)
        user = None if "user" in read_state.unloaded else read.user
        readers.append(
            ReaderInfo(
                user_id=str(read.user_id),
                display_name=user.display_name if user else "Участник",
                avatar_url=user.avatar_url if user else None,
            )
        )
    return readers


def _msg_to_dict(msg: Message) -> dict:
    reactions = _reaction_summaries(msg)
    readers = _reader_infos(msg)
    return {
        "id": str(msg.id),
        "chat_id": str(msg.chat_id),
        "author_id": str(msg.author_id) if msg.author_id else None,
        "author_username": msg.author.username if msg.author else None,
        "author_display_name": msg.author.display_name if msg.author else None,
        "text": msg.text,
        "edited": msg.edited,
        "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None,
        "mentions": msg.mentions or [],
        "attachments": msg.attachments or [],
        "reactions": [reaction.model_dump() for reaction in reactions],
        "readers": [reader.model_dump() for reader in readers],
        "created_at": msg.created_at.isoformat(),
    }


def _msg_response(msg: Message, display_name: str | None = None) -> MessageResponse:
    return MessageResponse(
        id=msg.id,
        chat_id=msg.chat_id,
        author_id=msg.author_id,
        author_username=msg.author.username if msg.author else None,
        author_display_name=display_name or (msg.author.display_name if msg.author else None),
        text=msg.text,
        edited=msg.edited,
        reply_to_id=msg.reply_to_id,
        mentions=msg.mentions or [],
        attachments=msg.attachments or [],
        reactions=_reaction_summaries(msg),
        readers=_reader_infos(msg),
        created_at=msg.created_at,
    )


@router.get("", response_model=list[ChatResponse])
async def list_chats(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    chats = await db.scalars(
        select(Chat)
        .where(Chat.family_id == family_id)
        .options(selectinload(Chat.pinned_message).selectinload(Message.author))
    )
    return [_chat_to_response(chat) for chat in chats.all()]


@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    family_id: UUID,
    body: ChatCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can create chats")

    chat = Chat(
        family_id=family_id,
        name=body.name,
        description=body.description,
        slow_mode_seconds=body.slow_mode_seconds,
        is_18plus=body.is_18plus,
        created_by=user.id,
    )
    db.add(chat)
    await db.commit()
    loaded_chat = await _load_chat_with_pin(db, family_id, chat.id)
    if not loaded_chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _chat_to_response(loaded_chat)


@router.patch("/{chat_id}", response_model=ChatResponse)
async def update_chat(
    family_id: UUID,
    chat_id: UUID,
    body: ChatUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can edit chat settings",
        )

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    updated = body.model_fields_set
    if "name" in updated and body.name is not None:
        chat.name = body.name
    if "description" in updated:
        chat.description = body.description
    if "slow_mode_seconds" in updated and body.slow_mode_seconds is not None:
        chat.slow_mode_seconds = body.slow_mode_seconds
    if "is_18plus" in updated and body.is_18plus is not None:
        chat.is_18plus = body.is_18plus

    await db.commit()

    loaded = await _load_chat_with_pin(db, family_id, chat_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Chat not found")

    response = _chat_to_response(loaded)
    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "chat_settings_updated",
            "chat_id": str(chat_id),
            "name": response.name,
            "description": response.description,
            "slow_mode_seconds": response.slow_mode_seconds,
            "is_18plus": response.is_18plus,
        },
    )
    return response


@router.post("/{chat_id}/pin", response_model=ChatResponse)
async def pin_message(
    family_id: UUID,
    chat_id: UUID,
    body: ChatPinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can pin messages",
        )

    chat = await _load_chat_with_pin(db, family_id, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    message = await db.scalar(select(Message).where(Message.id == body.message_id))
    if not message or message.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")

    chat.pinned_message_id = message.id
    await db.commit()

    updated_chat = await _load_chat_with_pin(db, family_id, chat_id)
    if not updated_chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    await ws_manager.broadcast_to_chat(chat_id, _chat_pin_update_payload(updated_chat))
    return _chat_to_response(updated_chat)


@router.delete("/{chat_id}/pin", response_model=ChatResponse)
async def unpin_message(
    family_id: UUID,
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can unpin messages",
        )

    chat = await _load_chat_with_pin(db, family_id, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if chat.pinned_message_id is None:
        return _chat_to_response(chat)

    chat.pinned_message_id = None
    await db.commit()

    updated_chat = await _load_chat_with_pin(db, family_id, chat_id)
    if not updated_chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    await ws_manager.broadcast_to_chat(chat_id, _chat_pin_update_payload(updated_chat))
    return _chat_to_response(updated_chat)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    family_id: UUID,
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete chats")

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    await db.delete(chat)
    await db.commit()


@router.get("/{chat_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    family_id: UUID,
    chat_id: UUID,
    limit: int = 50,
    before_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    _ensure_age_gate(chat, user)

    query = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reads).selectinload(MessageRead.user),
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before_id:
        anchor = await db.scalar(select(Message).where(Message.id == before_id))
        if anchor:
            query = query.where(Message.created_at < anchor.created_at)

    result = await db.scalars(query)
    messages = list(reversed(result.all()))
    return [_msg_response(m) for m in messages]


@router.get("/{chat_id}/messages/search", response_model=list[MessageSearchResult])
async def search_messages(
    family_id: UUID,
    chat_id: UUID,
    q: str = Query(..., min_length=1, max_length=120),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    chat = await db.scalar(
        select(Chat.id).where(Chat.id == chat_id, Chat.family_id == family_id)
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    normalized_query = " ".join(q.split()).strip()
    if len(normalized_query) == 0:
        return []

    escaped_query = _escape_like(normalized_query)
    pattern = f"%{escaped_query}%"
    lowered_text = func.lower(func.coalesce(Message.text, ""))
    lowered_query = normalized_query.lower()
    rank = case(
        (lowered_text == lowered_query, 0),
        (lowered_text.like(f"{lowered_query}%", escape="\\"), 1),
        else_=2,
    )
    match_pos = func.strpos(lowered_text, lowered_query)

    result = await db.scalars(
        select(Message)
        .where(
            Message.chat_id == chat_id,
            Message.text.ilike(pattern, escape="\\"),
        )
        .options(selectinload(Message.author))
        .order_by(rank.asc(), match_pos.asc(), Message.created_at.desc())
        .limit(MESSAGE_SEARCH_LIMIT)
    )

    rows = result.all()
    return [
        MessageSearchResult(
            id=message.id,
            author_display_name=message.author.display_name if message.author else None,
            snippet=_search_snippet(
                message.text,
                normalized_query,
                bool(message.attachments),
            ),
            created_at=message.created_at,
            has_attachments=bool(message.attachments),
            is_empty=not bool((message.text or "").strip()),
        )
        for message in rows
    ]


@router.post("/{chat_id}/messages/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_messages_read(
    family_id: UUID,
    chat_id: UUID,
    body: MessageReadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    if not body.message_ids:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    chat = await db.scalar(select(Chat).where(Chat.id == chat_id, Chat.family_id == family_id))
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    unique_ids = list(dict.fromkeys(body.message_ids))
    existing_ids = set(
        (
            await db.scalars(
                select(Message.id).where(
                    Message.chat_id == chat_id,
                    Message.id.in_(unique_ids),
                )
            )
        ).all()
    )
    valid_ids = [message_id for message_id in unique_ids if message_id in existing_ids]
    if not valid_ids:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    already_read_ids = set(
        (
            await db.scalars(
                select(MessageRead.message_id).where(
                    MessageRead.user_id == user.id,
                    MessageRead.message_id.in_(valid_ids),
                )
            )
        ).all()
    )
    to_insert = [message_id for message_id in valid_ids if message_id not in already_read_ids]
    if not to_insert:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    await db.execute(
        pg_insert(MessageRead)
        .values(
            [{"message_id": message_id, "user_id": user.id} for message_id in to_insert]
        )
        .on_conflict_do_nothing(index_elements=["message_id", "user_id"])
    )
    await db.commit()

    await ws_manager.broadcast_to_chat(
        chat_id,
        {
            "type": "messages_read",
            "user_id": str(user.id),
            "user_display_name": user.display_name,
            "message_ids": [str(message_id) for message_id in to_insert],
        },
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{chat_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    family_id: UUID,
    chat_id: UUID,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_member(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    _ensure_age_gate(chat, user)
    await _enforce_slow_mode(chat, user, membership, db)

    mentions = _parse_mentions(body.text)

    msg = Message(
        chat_id=chat_id,
        author_id=user.id,
        text=body.text,
        reply_to_id=body.reply_to_id,
        mentions=mentions,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg, ["author"])
    await db.commit()

    msg_dict = _msg_to_dict(msg)
    await ws_manager.broadcast_to_chat(chat_id, {"type": "new_message", "message": msg_dict})

    if mentions:
        await ws_manager.broadcast_to_family(
            family_id,
            {
                "type": "mention",
                "from": user.display_name,
                "chat_id": str(chat_id),
                "chat_name": chat.name,
                "text": body.text[:100],
                "mentions": mentions,
            },
        )

    return _msg_response(msg, user.display_name)


@router.post("/{chat_id}/messages/attachments", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_with_attachments(
    family_id: UUID,
    chat_id: UUID,
    files: list[UploadFile] = File(...),
    text: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_member(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    _ensure_age_gate(chat, user)
    await _enforce_slow_mode(chat, user, membership, db)

    clean_files = [f for f in files if f.filename]
    if not clean_files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(clean_files) > MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum: {MAX_ATTACHMENTS_PER_MESSAGE}",
        )

    body_text = (text or "").strip()
    if len(body_text) > 4000:
        raise HTTPException(status_code=400, detail="Text too long (max 4000)")

    dest_dir = CHAT_UPLOAD_DIR / str(chat_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    attachments: list[dict] = []
    for upload in clean_files:
        payload = await upload.read()
        if len(payload) > MAX_ATTACHMENT_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{upload.filename}' is too large (max 50 MB)",
            )

        original_name = upload.filename or "file"
        ext = Path(original_name).suffix[:16]
        stored_name = f"{uuid.uuid4()}{ext}"
        target = dest_dir / stored_name
        try:
            target.write_bytes(payload)
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Failed to save attachment",
            ) from exc

        attachments.append(
            {
                "kind": _attachment_kind(upload.content_type, original_name),
                "url": f"/static/uploads/chat_files/{chat_id}/{stored_name}",
                "file_name": original_name,
                "file_size": len(payload),
                "content_type": upload.content_type,
            }
        )

    mentions = _parse_mentions(body_text) if body_text else []

    msg = Message(
        chat_id=chat_id,
        author_id=user.id,
        text=body_text,
        mentions=mentions,
        attachments=attachments,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg, ["author"])
    await db.commit()

    msg_dict = _msg_to_dict(msg)
    await ws_manager.broadcast_to_chat(chat_id, {"type": "new_message", "message": msg_dict})

    if mentions:
        await ws_manager.broadcast_to_family(
            family_id,
            {
                "type": "mention",
                "from": user.display_name,
                "chat_id": str(chat_id),
                "chat_name": chat.name,
                "text": body_text[:100],
                "mentions": mentions,
            },
        )

    return _msg_response(msg, user.display_name)




MAX_VOICE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/{chat_id}/messages/voice", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_voice_message(
    family_id: UUID,
    chat_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_member(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    _ensure_age_gate(chat, user)
    await _enforce_slow_mode(chat, user, membership, db)

    payload = await file.read()
    if len(payload) > MAX_VOICE_SIZE:
        raise HTTPException(status_code=413, detail="Voice message too large (max 10 MB)")

    dest_dir = CHAT_UPLOAD_DIR / str(chat_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"voice_{uuid.uuid4()}.webm"
    target = dest_dir / stored_name
    try:
        target.write_bytes(payload)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to save voice message") from exc

    attachment = {
        "kind": "voice",
        "url": f"/static/uploads/chat_files/{chat_id}/{stored_name}",
        "file_name": stored_name,
        "file_size": len(payload),
        "content_type": file.content_type or "audio/webm",
    }

    msg = Message(
        chat_id=chat_id,
        author_id=user.id,
        text="",
        attachments=[attachment],
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg, ["author"])
    await db.commit()

    msg_dict = _msg_to_dict(msg)
    await ws_manager.broadcast_to_chat(chat_id, {"type": "new_message", "message": msg_dict})

    return _msg_response(msg, user.display_name)

@router.patch("/{chat_id}/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    family_id: UUID,
    chat_id: UUID,
    message_id: UUID,
    body: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    msg = await db.scalar(
        select(Message).where(Message.id == message_id).options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reads).selectinload(MessageRead.user),
        )
    )
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only edit your own messages")

    msg.text = body.text
    msg.edited = True
    msg.mentions = _parse_mentions(body.text)
    await db.commit()

    await ws_manager.broadcast_to_chat(
        chat_id,
        {"type": "message_edited", "message": {"id": str(msg.id), "text": msg.text, "edited": True}},
    )
    return _msg_response(msg)


@router.delete("/{chat_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    family_id: UUID,
    chat_id: UUID,
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)

    chat = await _load_chat_with_pin(db, family_id, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    msg = await db.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != user.id and m.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    was_pinned = chat.pinned_message_id == message_id
    if was_pinned:
        chat.pinned_message_id = None

    upload_root = get_upload_root()
    for item in msg.attachments or []:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str) or not url.startswith("/static/uploads/"):
            continue
        path = upload_root / url.removeprefix("/static/uploads/")
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    await db.delete(msg)
    await db.commit()

    await ws_manager.broadcast_to_chat(
        chat_id,
        {"type": "message_deleted", "message_id": str(message_id)},
    )
    if was_pinned:
        await ws_manager.broadcast_to_chat(chat_id, _chat_pin_update_payload(chat))


@router.post(
    "/{chat_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def add_reaction(
    family_id: UUID,
    chat_id: UUID,
    message_id: UUID,
    body: MessageReactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    emoji = body.emoji.strip()
    if not EMOJI_RE.fullmatch(emoji):
        raise HTTPException(status_code=422, detail="Emoji must contain exactly one emoji")

    msg = await db.scalar(select(Message).where(Message.id == message_id))
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")

    result = await db.execute(
        pg_insert(MessageReaction)
        .values(
            message_id=message_id,
            user_id=user.id,
            emoji=emoji,
        )
        .on_conflict_do_nothing(
            index_elements=["message_id", "user_id", "emoji"],
        )
    )
    await db.commit()

    if (result.rowcount or 0) == 0:
        return

    await ws_manager.broadcast_to_chat(
        chat_id,
        {
            "type": "reaction_added",
            "message_id": str(message_id),
            "emoji": emoji,
            "user_id": str(user.id),
            "display_name": user.display_name,
        },
    )


@router.delete(
    "/{chat_id}/messages/{message_id}/reactions/{emoji}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_reaction(
    family_id: UUID,
    chat_id: UUID,
    message_id: UUID,
    emoji: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    if not EMOJI_RE.fullmatch(emoji):
        raise HTTPException(status_code=422, detail="Emoji must contain exactly one emoji")

    msg = await db.scalar(select(Message).where(Message.id == message_id))
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")

    result = await db.execute(
        delete(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.emoji == emoji,
        )
    )
    await db.commit()

    if (result.rowcount or 0) > 0:
        await ws_manager.broadcast_to_chat(
            chat_id,
            {
                "type": "reaction_removed",
                "message_id": str(message_id),
                "emoji": emoji,
                "user_id": str(user.id),
            },
        )


@router.websocket("/{chat_id}/ws")
async def chat_ws(
    websocket: WebSocket,
    family_id: UUID,
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")
    user_id = decode_access_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        await websocket.close(code=4001)
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

    await websocket.accept()
    await ws_manager.connect(chat_id, websocket)
    became_online = ws_manager.register_presence_connection(family_id, user.id, websocket)
    if became_online:
        user.is_online = True
        await db.commit()
        await ws_manager.broadcast_to_family(
            family_id,
            _presence_payload(
                family_id=family_id,
                user_id=user.id,
                is_online=True,
                last_seen_at=user.last_seen_at,
            ),
        )

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(chat_id, websocket)
        became_offline = ws_manager.unregister_presence_connection(
            family_id,
            user.id,
            websocket,
        )
        if became_offline:
            user.is_online = False
            user.last_seen_at = datetime.now(timezone.utc)
            await db.commit()
            await ws_manager.broadcast_to_family(
                family_id,
                _presence_payload(
                    family_id=family_id,
                    user_id=user.id,
                    is_online=False,
                    last_seen_at=user.last_seen_at,
                ),
            )
