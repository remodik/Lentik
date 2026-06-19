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
    query = dict(url.query)

    sslmode = query.pop("sslmode", None)
    # channel_binding — тоже libpq-only; asyncpg делает SCRAM channel binding
    # сам и явного kwarg не принимает.
    query.pop("channel_binding", None)
    # На случай, если кто-то задал asyncpg-style ssl прямо в URL.
    ssl_in_query = query.pop("ssl", None)

    connect_args: dict = {}
    require_ssl = ssl_in_query or (sslmode and sslmode != "disable")
    if require_ssl:
        connect_args["ssl"] = "require"

    cleaned_url = url.set(query=query)
    return create_async_engine(cleaned_url, echo=False, connect_args=connect_args)


engine = _build_async_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)
