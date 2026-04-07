from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013_chat_pinned_message"
down_revision = "012_user_presence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("pinned_message_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_chats_pinned_message_id_messages",
        "chats",
        "messages",
        ["pinned_message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_chats_pinned_message_id",
        "chats",
        ["pinned_message_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chats_pinned_message_id", table_name="chats")
    op.drop_constraint("fk_chats_pinned_message_id_messages", "chats", type_="foreignkey")
    op.drop_column("chats", "pinned_message_id")
