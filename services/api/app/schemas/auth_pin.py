from pydantic import BaseModel, Field


class AuthPinRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    pin: str = Field(pattern=r"^\d{4}$")


class AuthResponse(BaseModel):
    user_id: str