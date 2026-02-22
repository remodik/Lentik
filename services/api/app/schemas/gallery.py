from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.gallery_item import MediaType


class GalleryItemResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    uploaded_by: UUID | None
    media_type: MediaType
    url: str
    caption: str | None
    created_at: datetime