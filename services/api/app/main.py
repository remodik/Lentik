import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers.auth import router as auth_router
from app.routers.channels import router as channels_router
from app.routers.chats import router as chats_router
from app.routers.families import router as families_router
from app.routers.gallery import router as gallery_router
from app.routers.invites import router as invites_router
from app.routers.me import router as me_router
from app.routers.families_join import router as families_join_router

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def create_app() -> FastAPI:
    app = FastAPI(title="Lentik API", version="0.2.0")

    app.mount("/static/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    app.include_router(auth_router)
    app.include_router(invites_router)
    app.include_router(families_router)
    app.include_router(me_router)
    app.include_router(chats_router)
    app.include_router(channels_router)
    app.include_router(gallery_router)
    app.include_router(families_join_router)

    return app


app = create_app()