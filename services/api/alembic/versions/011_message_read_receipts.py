from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "011_message_read_receipts"
down_revision = "010_message_reactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_reads",
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "read_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_message_reads_message_id",
        "message_reads",
        ["message_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_message_reads_message_id", table_name="message_reads")
    op.drop_table("message_reads")
