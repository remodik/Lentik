"""Удаление мёртвой таблицы sessions (L12).

Серверных сессий нет — аутентификация полностью stateless-JWT (core/jwt.py +
auth/deps.py), revocation через User.password_changed_at. Модель Session и
core/sessions.py не использовались нигде; удаляем код и таблицу.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "033_drop_sessions"
down_revision = "032_login_throttle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("sessions")


def downgrade() -> None:
    # Восстанавливаем структуру таблицы (на случай отката), без данных.
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
