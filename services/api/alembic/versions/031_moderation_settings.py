"""Настройки модерации семьи (family_moderation_settings).

Создаёт таблицу один-к-одному с family и сидит дефолтную строку для каждой
уже существующей семьи.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "031_moderation_settings"
down_revision = "029_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "family_moderation_settings",
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("invite_max_active", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("slowmode_default_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "banned_words",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("max_message_length", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Сидим дефолтную строку для каждой существующей семьи.
    op.execute(
        """
        INSERT INTO family_moderation_settings (family_id)
        SELECT id FROM families
        ON CONFLICT (family_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("family_moderation_settings")
