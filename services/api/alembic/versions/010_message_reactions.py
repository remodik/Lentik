from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010_message_reactions"
down_revision = "009_message_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_reactions",
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
        sa.Column("emoji", sa.String(length=16), nullable=False, primary_key=True),
    )
    op.create_index(
        "ix_message_reactions_message_id",
        "message_reactions",
        ["message_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_message_reactions_message_id", table_name="message_reactions")
    op.drop_table("message_reactions")
