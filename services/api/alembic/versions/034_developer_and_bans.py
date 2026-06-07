"""Аккаунт разработчика (god-mode), глобальные баны и платформенный аудит."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "034_developer_and_bans"
down_revision = "033_drop_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Новые поля на users ──────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column(
            "is_developer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_banned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("users", sa.Column("ban_reason", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("ban_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("banned_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_banned_by",
        "users",
        "users",
        ["banned_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── Глобальный журнал аудита ─────────────────────────────────────────────
    op.create_table(
        "platform_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_platform_audit_log_action", "platform_audit_log", ["action"]
    )
    op.create_index(
        "ix_platform_audit_log_created_at", "platform_audit_log", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_platform_audit_log_created_at", table_name="platform_audit_log")
    op.drop_index("ix_platform_audit_log_action", table_name="platform_audit_log")
    op.drop_table("platform_audit_log")

    op.drop_constraint("fk_users_banned_by", "users", type_="foreignkey")
    op.drop_column("users", "banned_by")
    op.drop_column("users", "banned_at")
    op.drop_column("users", "ban_expires_at")
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "is_banned")
    op.drop_column("users", "is_developer")
