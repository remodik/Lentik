"""Add bots: users.is_bot flag + bots table (Phase 1 bot Dev API).

A bot is a regular user (is_bot=True) plus a membership, so permissions,
roles and message rendering are reused. The bots table holds bot-specific
data: owner and the hashed access token (sha256 hex; the raw token is shown
once on creation and never stored).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op


revision = "025_bots"
down_revision = "024_user_password_changed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_bot",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_table(
        "bots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_bots_token_hash", "bots", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bots_token_hash", table_name="bots")
    op.drop_table("bots")
    op.drop_column("users", "is_bot")
