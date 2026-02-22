from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.deps import get_db
from app.models.family import Family
from app.schemas.families import CreateFamilyRequest, FamilyResponse

router = APIRouter(prefix="/families", tags=["families"])


@router.post("", response_model=FamilyResponse)
async def create_family(
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
):
    family = Family(name=body.name)
    db.add(family)
    await db.commit()
    await db.refresh(family)
    return family
