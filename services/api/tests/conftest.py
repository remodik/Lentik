"""Тестовая инфраструктура для backend.

Стратегия изоляции:
  * Отдельная физическая БД ``lentik_test`` (НЕ прод ``lentik``). Создаётся
    заново в начале сессии (DROP + CREATE), схема поднимается из
    ``Base.metadata.create_all`` — модели используют JSONB/BigInt/enum/partial
    index, поэтому нужен именно Postgres.
  * Каждый тест выполняется в одной внешней транзакции, а сессия открыта в
    режиме ``join_transaction_mode="create_savepoint"``. Любые ``commit()`` в
    коде приложения становятся релизами savepoint'ов внутри этой транзакции;
    по завершении теста — полный ROLLBACK. Прод-данные не затрагиваются.

httpx гоняет ASGI-приложение напрямую (без сети). Lifespan не запускается, так
что стартовый auto-migrate приложения не выполняется и прод-БД не трогается.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from urllib.parse import urlparse, urlunparse

import asyncpg
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# Важно: импортируем app.models, чтобы все модели зарегистрировались в metadata.
import app.models  # noqa: F401
from app.core.config import settings
from app.core.jwt import create_access_token
from app.core.security import hash_pin
from app.db.base import Base
from app.db.deps import get_db
from app.main import app
from app.models.membership import Membership, Role
from app.models.role import FamilyRole, MemberRole
from app.models.user import User
from app.services.family import create_family
from app.services.roles import assign_default_roles_on_join

TEST_DB_NAME = "lentik_test"


def _swap_db_name(async_url: str, db_name: str) -> str:
    """Меняет имя БД в SQLAlchemy-URL (postgresql+asyncpg://.../<db>)."""
    parsed = urlparse(async_url)
    new_path = f"/{db_name}"
    return urlunparse(parsed._replace(path=new_path))


def _asyncpg_dsn(async_url: str, db_name: str) -> str:
    """Чистый DSN для asyncpg (без +asyncpg и без query)."""
    parsed = urlparse(async_url)
    scheme = parsed.scheme.split("+")[0]  # postgresql+asyncpg -> postgresql
    return urlunparse(
        parsed._replace(scheme=scheme, path=f"/{db_name}", query="", fragment="")
    )


TEST_DATABASE_URL = _swap_db_name(settings.database_url, TEST_DB_NAME)


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def _create_test_database() -> AsyncGenerator[None, None]:
    """Пересоздаёт чистую тестовую БД на старте сессии."""
    # Подключаемся к существующей (прод) БД лишь чтобы выполнить DDL уровня
    # кластера: DROP/CREATE DATABASE (нельзя внутри транзакции).
    admin_dsn = _asyncpg_dsn(settings.database_url, urlparse(settings.database_url).path.lstrip("/"))
    conn = await asyncpg.connect(admin_dsn)
    try:
        # Сбросим возможные активные подключения и пересоздадим БД.
        await conn.execute(
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{TEST_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
        await conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        await conn.close()
    yield


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine(_create_test_database):
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """Сессия теста: внешняя транзакция + savepoint-режим, ROLLBACK в конце."""
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        await session.close()
        if trans.is_active:
            await trans.rollback()
        await conn.close()


@pytest.fixture(autouse=True)
def _reset_inmemory_limiters():
    """In-memory rate-лимитеры — модульные синглтоны, переживающие тесты.
    Чистим их перед каждым тестом, чтобы регистрации/входы не загрязняли друг друга."""
    from app.core import rate_limit as rl

    for lim in (
        rl.pin_failure_limiter,
        rl.pin_failure_ip_limiter,
        rl.check_username_limiter,
        rl.register_ip_limiter,
    ):
        lim._events.clear()
    yield


@pytest_asyncio.fixture(loop_scope="session")
async def client(db) -> AsyncGenerator[httpx.AsyncClient, None]:
    """httpx-клиент против ASGI-приложения, использующий тестовую сессию."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        # Все запросы в рамках одного теста делят одну сессию/транзакцию.
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


# ─── Хелперы для построения данных ──────────────────────────────────────────


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def token_for(user: User) -> str:
    return create_access_token(user.id, not_before=user.password_changed_at)


async def make_user(db: AsyncSession, username: str, display: str | None = None) -> User:
    user = User(
        username=username,
        display_name=display or username,
        password_hash=hash_pin("1234"),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def make_family(db: AsyncSession, owner: User, name: str = "Тестовая семья"):
    return await create_family(name=name, owner=owner, db=db)


async def add_member(
    db: AsyncSession, family_id, user: User, role: Role = Role.MEMBER
) -> Membership:
    m = Membership(family_id=family_id, user_id=user.id, role=role)
    db.add(m)
    await db.flush()
    await assign_default_roles_on_join(db, m)
    await db.flush()
    return m


async def role_by_slug(db: AsyncSession, family_id, slug: str) -> FamilyRole | None:
    return await db.scalar(
        select(FamilyRole).where(
            FamilyRole.family_id == family_id,
            FamilyRole.slug == slug,
        )
    )


async def grant_role(db: AsyncSession, membership: Membership, role: FamilyRole) -> None:
    """Назначает участнику роль напрямую (минуя HTTP-защиты)."""
    db.add(MemberRole(membership_id=membership.id, role_id=role.id))
    await db.flush()
