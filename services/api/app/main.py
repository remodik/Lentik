import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update, func

from app.core.config import settings
from app.core.redis_client import close_redis
from app.core.uploads import get_upload_root
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.ws.manager import ws_manager
from app.routers.auth import router as auth_router
from app.routers.budget import family_router as budget_family_router, tx_router as budget_tx_router
from app.routers.calendar import router as calendar_router
from app.routers.channels import router as channels_router
from app.routers.chats import router as chats_router
from app.routers.expenses import router as expenses_router
from app.routers.families import router as families_router
from app.routers.families_join import router as families_join_router
from app.routers.audit_log import router as audit_log_router
from app.routers.family_roles import router as family_roles_router
from app.routers.permission_overrides import router as permission_overrides_router
from app.routers.family_tree import (
    family_router as family_tree_family_router,
    person_router as family_tree_person_router,
    relation_router as family_tree_relation_router,
)
from app.routers.gallery import router as gallery_router
from app.routers.invites import router as invites_router
from app.routers.me import router as me_router
from app.routers.notes import family_router as notes_family_router, note_router as notes_note_router
from app.routers.uploads import router as uploads_router
from app.routers.reminders import (
    family_router as reminders_family_router,
    reminder_router as reminders_reminder_router,
)
from app.services.calendar_reminders import (
    start_calendar_reminder_scheduler,
    stop_calendar_reminder_scheduler,
)
from app.services.reminder_dispatcher import (
    start_reminder_scheduler,
    stop_reminder_scheduler,
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = get_upload_root()


async def _check_migrations() -> None:
    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        from app.db.session import engine

        alembic_cfg = Config("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        expected_heads = set(script.get_heads())

        async with engine.connect() as conn:
            def _get_current(sync_conn):
                ctx = MigrationContext.configure(sync_conn)
                return set(ctx.get_current_heads())

            current_heads = await conn.run_sync(_get_current)

        if current_heads != expected_heads:
            msg = (
                f"Database migration drift detected! "
                f"current={sorted(current_heads)!r}, expected={sorted(expected_heads)!r}. "
                f"Run: alembic upgrade heads"
            )
            if settings.strict_migrations:
                raise RuntimeError(msg)
            else:
                logger.warning("⚠️  %s", msg)
        else:
            logger.info("✅ DB revisions up to date: %s", sorted(current_heads))

    except RuntimeError:
        raise
    except Exception as exc:
        logger.warning("Migration check skipped: %s", exc)


async def _auto_migrate() -> None:
    try:
        import asyncio
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("alembic.ini")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "heads")
        logger.info("✅ Alembic migrations applied")
    except Exception as exc:
        logger.warning("Auto-migration failed (non-fatal): %s", exc)


def _check_security_config() -> None:
    """Предупреждения о небезопасной конфигурации на старте.

    Жёсткие падения (пустой/`*` CORS, короткий JWT_SECRET) ловит валидатор
    Settings; здесь — мягкие warning'и про прод-настройки.
    """
    if not settings.is_production:
        logger.warning(
            "IS_PRODUCTION=false: auth-cookie выставляется без флага Secure "
            "(ок для локальной разработки по HTTP). В проде обязательно "
            "выставьте IS_PRODUCTION=true."
        )
        return

    # ── Прод: небезопасный конфиг должен валить старт, а не молча warning'ить.
    insecure = [
        o for o in settings.cors_origins
        if o.startswith("http://") or "localhost" in o or "127.0.0.1" in o
    ]
    if insecure:
        raise RuntimeError(
            "IS_PRODUCTION=true, но cors_origins содержит небезопасные/локальные "
            f"origin: {insecure}. Оставьте только https-origin фронтенда."
        )

    if settings.auto_migrate:
        logger.warning(
            "IS_PRODUCTION=true и AUTO_MIGRATE=true: при нескольких репликах "
            "миграции могут гоняться при одновременном старте. Рекомендуется "
            "AUTO_MIGRATE=false + отдельный шаг `alembic upgrade heads` в деплое."
        )


def create_app() -> FastAPI:
    app_ = FastAPI(title="Lentik API", version="0.3.0")
    
    app_.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app_.middleware("http")
    async def security_headers(request, call_next):
        """Глобальные защитные заголовки на все ответы API (CWE-693).

        setdefault — чтобы не затирать заголовки, выставленные эндпоинтами явно
        (например, Content-Disposition/X-Content-Type-Options в отдаче файлов).
        CSP здесь не ставим: API отдаёт JSON и медиа, а не HTML-документы —
        строгая политика живёт на фронте (next.config.js).
        """
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), camera=(), microphone=()"
        )
        return response

    app_.include_router(uploads_router)
    app_.include_router(auth_router)
    app_.include_router(invites_router)
    app_.include_router(families_router)
    app_.include_router(family_roles_router)
    app_.include_router(permission_overrides_router)
    app_.include_router(audit_log_router)
    app_.include_router(me_router)
    app_.include_router(chats_router)
    app_.include_router(channels_router)
    app_.include_router(gallery_router)
    app_.include_router(calendar_router)
    app_.include_router(families_join_router)
    app_.include_router(notes_family_router)
    app_.include_router(notes_note_router)
    app_.include_router(expenses_router)
    app_.include_router(budget_family_router)
    app_.include_router(budget_tx_router)
    app_.include_router(reminders_family_router)
    app_.include_router(reminders_reminder_router)
    app_.include_router(family_tree_family_router)
    app_.include_router(family_tree_person_router)
    app_.include_router(family_tree_relation_router)

    @app_.on_event("startup")
    async def on_startup() -> None:
        _check_security_config()
        if settings.auto_migrate:
            await _auto_migrate()
        await _check_migrations()
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(User)
                .where(User.is_online == True)
                .values(is_online=False, last_seen_at=func.now())
            )
            await db.commit()
        # Подписка на Redis fan-out (no-op, если REDIS_URL не задан).
        await ws_manager.start()
        # Планировщики можно отключить на web-инстансах (отдельный worker).
        if settings.scheduler_enabled:
            await start_reminder_scheduler()
            await start_calendar_reminder_scheduler()

    @app_.on_event("shutdown")
    async def on_shutdown() -> None:
        await stop_calendar_reminder_scheduler()
        await stop_reminder_scheduler()
        await ws_manager.stop()
        await close_redis()

    return app_


app = create_app()
