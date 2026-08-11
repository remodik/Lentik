import re
from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _validate_pin(v: str) -> str:
    if not re.fullmatch(r"\d{4,8}", v):
        raise ValueError("PIN должен быть от 4 до 8 цифр")
    return v


def _validate_birthday(v: date) -> date:
    # ДР задаётся один раз при регистрации и потом неизменно, поэтому
    # валидируем строго: не в будущем и в разумных пределах (после 1900).
    today = date.today()
    if v > today:
        raise ValueError("Дата рождения не может быть в будущем")
    if v.year < 1900:
        raise ValueError("Укажите корректную дату рождения")
    return v


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=1, max_length=64)
    pin: str
    birthday: date

    _pin = field_validator("pin")(_validate_pin)
    _birthday = field_validator("birthday")(_validate_birthday)


class JoinByInviteRequest(BaseModel):
    token: str
    display_name: str = Field(min_length=1, max_length=64)
    pin: str
    birthday: date

    _pin = field_validator("pin")(_validate_pin)
    _birthday = field_validator("birthday")(_validate_birthday)


class JoinByInviteResponse(BaseModel):
    user_id: UUID
    family_id: UUID
    # JWT отдаётся только httpOnly-cookie (CWE-522), в тело не кладётся.
    access_token: str | None = None