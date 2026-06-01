from pydantic import BaseModel, Field


class AuthPinRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    # 4–8 цифр: старые 4-значные PIN остаются валидными, новые могут быть длиннее.
    pin: str = Field(pattern=r"^\d{4,8}$")


class AuthResponse(BaseModel):
    user_id: str
    # JWT отдаётся только httpOnly-cookie. Поле оставлено для совместимости
    # контракта, но реальный токен в тело НЕ кладётся (CWE-522).
    access_token: str | None = None
