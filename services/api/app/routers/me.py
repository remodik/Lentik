from fastapi import APIRouter, Depends
from app.auth.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def me(user: User = Depends(get_current_user)):
    return {"id": str(user.id), "username": user.username}