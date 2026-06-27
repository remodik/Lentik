from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings


def _build_async_engine():
    """Создаёт async-движок, нормализуя строку подключения под asyncpg.

    Neon (и большинство managed-Postgres) отдают libpq-style URL с
    `?sslmode=require&channel_binding=require`. Драйвер asyncpg таких kwargs
    не знает и падает с `TypeError: connect() got an unexpected keyword
    argument 'sslmode'`. Здесь вырезаем libpq-параметры из query и включаем
    TLS через connect_args (asyncpg понимает ssl='require'). Миграции через
    psycopg2 строят свой URL отдельно — см. alembic/env.py.
    """
    url = make_url(settings.database_url)
    if url.get_backend_name() == "postgresql" and url.drivername != "postgresql+asyncpg":
        url = url.set(drivername="postgresql+asyncpg")
    query = dict(url.query)

    sslmode = query.pop("sslmode", None)
    query.pop("channel_binding", None)
    ssl_in_query = query.pop("ssl", None)

    connect_args: dict = {}
    require_ssl = ssl_in_query or (sslmode and sslmode != "disable")
    if require_ssl:
        connect_args["ssl"] = "require"

    cleaned_url = url.set(query=query)
    return create_async_engine(
        cleaned_url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=300,
    )


engine = _build_async_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)
