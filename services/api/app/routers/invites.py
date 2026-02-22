import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.deps import get_db
from app.models import Family, Invite
from app.schemas.invites import CreateInviteRequest, CreateInviteResponse

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CreateInviteResponse:
    family = await db.get(Family, body.family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    invite = Invite(
        family_id=body.family_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    base_url = str(request.base_url).rstrip("/")
    join_url = f"{base_url}/join?token={token}"

    return CreateInviteResponse(
        token=token,
        expires_at=expires_at,
        join_url=join_url,
    )