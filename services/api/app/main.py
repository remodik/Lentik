from fastapi import FastAPI

from app.routers.auth import router as auth_router
from app.routers.families import router as families_router
from app.routers.invites import router as invites_router
from app.routers.me import router as me_router


def create_app() -> FastAPI:
    app = FastAPI(title="Lentik API", version="0.1.0")

    # Routers
    app.include_router(invites_router)
    app.include_router(auth_router)
    app.include_router(families_router)
    app.include_router(me_router)

    return app


app = create_app()
