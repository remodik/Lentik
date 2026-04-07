from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    database_url: str
    jwt_secret: str
    upload_dir: str = "uploads"
    is_production: bool = False
    strict_migrations: bool = False

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if not v or len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters. "
                "Generate: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v


settings = Settings()  # type: ignore[call-arg]