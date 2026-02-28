import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.jwt import COOKIE_NAME, decode_access_token
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.message import Message
from app.models.user import User
from app.schemas.chats import (
    ChatCreate, ChatResponse,
    MessageCreate, MessageResponse, MessageUpdate,
)
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families/{family_id}/chats", tags=["chats"])

MENTION_RE = re.compile(r"@([\w_]+)")


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


def _parse_mentions(text: str) -> list[str]:
    return list(set(MENTION_RE.findall(text)))


def _msg_to_dict(msg: Message) -> dict:
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
        created_at=msg.created_at,
    )


@router.get("", response_model=list[ChatResponse])
async def list_chats(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    chats = await db.scalars(select(Chat).where(Chat.family_id == family_id))
    return chats.all()


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

    chat = Chat(family_id=family_id, name=body.name, created_by=user.id)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return chat


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

    query = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .options(selectinload(Message.author))
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


@router.post("/{chat_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    family_id: UUID,
    chat_id: UUID,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Chat not found")

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
        select(Message).where(Message.id == message_id).options(selectinload(Message.author))
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

    msg = await db.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != user.id and m.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    await db.delete(msg)
    await db.commit()

    await ws_manager.broadcast_to_chat(
        chat_id,
        {"type": "message_deleted", "message_id": str(message_id)},
    )


@router.websocket("/{chat_id}/ws")
async def chat_ws(
    websocket: WebSocket,
    family_id: UUID,
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    token = websocket.cookies.get(COOKIE_NAME)
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

    await ws_manager.connect(chat_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(chat_id, websocket)