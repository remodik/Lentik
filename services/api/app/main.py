import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import update, func

from app.core.config import settings
from app.core.uploads import get_upload_root
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.routers.auth import router as auth_router
from app.routers.calendar import router as calendar_router
from app.routers.channels import router as channels_router
from app.routers.chats import router as chats_router
from app.routers.expenses import router as expenses_router
from app.routers.families import router as families_router
from app.routers.families_join import router as families_join_router
from app.routers.gallery import router as gallery_router
from app.routers.invites import router as invites_router
from app.routers.me import router as me_router
from app.routers.notes import family_router as notes_family_router, note_router as notes_note_router
from app.services.calendar_reminders import (
    stop_calendar_reminder_scheduler,
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


def create_app() -> FastAPI:
    app_ = FastAPI(title="Lentik API", version="0.3.0")
    
    app_.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app_.mount("/static/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    app_.include_router(auth_router)
    app_.include_router(invites_router)
    app_.include_router(families_router)
    app_.include_router(me_router)
    app_.include_router(chats_router)
    app_.include_router(channels_router)
    app_.include_router(gallery_router)
    app_.include_router(calendar_router)
    app_.include_router(families_join_router)
    app_.include_router(notes_family_router)
    app_.include_router(notes_note_router)
    app_.include_router(expenses_router)

    @app_.on_event("startup")
    async def on_startup() -> None:
        await _auto_migrate()
        await _check_migrations()
        await stop_calendar_reminder_scheduler()
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(User)
                .where(User.is_online == True)
                .values(is_online=False, last_seen_at=func.now())
            )
            await db.commit()

    @app_.on_event("shutdown")
    async def on_shutdown() -> None:
        await stop_calendar_reminder_scheduler()

    return app_


app = create_app()
