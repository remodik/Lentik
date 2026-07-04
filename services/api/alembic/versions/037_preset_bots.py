"""Add preset_bots (built-in scheduled family bots — track D).

Each row is a preset (birthday/digest) enabled in a family, linked to its own
bot identity user. The preset_dispatcher polls this table and posts on schedule.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op


revision = "037_preset_bots"
down_revision = "026_message_components"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "preset_bots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("preset_key", sa.String(length=32), nullable=False),
        sa.Column(
            "bot_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "target_chat_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chats.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "config",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("family_id", "preset_key", name="uq_family_preset"),
    )
    op.create_index(
        "ix_preset_bots_enabled", "preset_bots", ["enabled"]
    )


def downgrade() -> None:
    op.drop_index("ix_preset_bots_enabled", table_name="preset_bots")
    op.drop_table("preset_bots")
