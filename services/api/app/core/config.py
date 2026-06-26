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
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ── Масштабирование (prod-readiness) ────────────────────────────────────
    # Общий брокер для WS-fan-out (P1) и общих rate-лимитеров (P3).
    # Пусто → single-process режим (как раньше): без Redis, всё в памяти.
    redis_url: str | None = None

    # ── Аккаунт разработчика (god-mode + админ-панель) ──────────────────────
    # Username единственного платформенного администратора. На старте этому
    # пользователю проставляется is_developer=True, у остальных снимается.
    # Пусто → god-mode-аккаунта нет.
    developer_username: str | None = None

    # Запускать ли in-process планировщики напоминаний (P2). На web-инстансах
    # можно отключить и держать отдельный worker-процесс. Диспетч идемпотентен
    # (SELECT ... FOR UPDATE SKIP LOCKED), так что несколько включённых безопасны.
    scheduler_enabled: bool = True

    # Применять ли `alembic upgrade heads` на старте приложения (P2). В проде
    # рекомендуется false + отдельный шаг деплоя, чтобы реплики не гонялись.
    auto_migrate: bool = True

    # ── Web Push (VAPID) — доставка уведомлений вне приложения ───────────────
    # Пусто → push выключен (как раньше): напоминания только по WS. Генерация:
    #   pip install py-vapid && vapid --gen   (или `npx web-push generate-vapid-keys`)
    # Публичный ключ отдаётся фронту, приватный — секрет.
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    # Контакт для push-сервисов (mailto: или https URL) — попадает в VAPID-claims.
    vapid_subject: str = "mailto:admin@lentik.app"

    # ── Хранилище загрузок (P4): local | s3 ─────────────────────────────────
    storage_backend: str = "local"
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_addressing_style: str = "virtual"

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if not v or len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters. "
                "Generate: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, v: list[str]) -> list[str]:
        # CORS используется с allow_credentials=True. Со звёздочкой Starlette
        # начнёт отражать Origin запроса вместе с разрешением credentials —
        # это позволит любому сайту делать аутентифицированные запросы (CWE-942).
        cleaned = [o.strip() for o in v]
        if any(o == "*" for o in cleaned):
            raise ValueError(
                "cors_origins не может содержать '*' при allow_credentials=True. "
                "Укажите точный список https-origin фронтенда."
            )
        if any(not o for o in cleaned):
            raise ValueError("cors_origins содержит пустое значение origin.")
        return cleaned

    @field_validator("storage_backend")
    @classmethod
    def validate_storage_backend(cls, v: str) -> str:
        v = (v or "local").strip().lower()
        if v not in ("local", "s3"):
            raise ValueError("storage_backend должен быть 'local' или 's3'.")
        return v

    @field_validator("s3_addressing_style")
    @classmethod
    def validate_s3_addressing_style(cls, v: str) -> str:
        v = (v or "virtual").strip().lower()
        if v not in ("virtual", "path", "auto"):
            raise ValueError("s3_addressing_style: 'virtual', 'path' или 'auto'.")
        return v


settings = Settings()  # type: ignore[call-arg]