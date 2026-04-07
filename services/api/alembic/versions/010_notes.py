from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010_notes"
down_revision = "009_message_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "is_personal",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_notes_family_id", "notes", ["family_id"])
    op.create_index("ix_notes_author_id", "notes", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_notes_author_id", table_name="notes")
    op.drop_index("ix_notes_family_id", table_name="notes")
    op.drop_table("notes")
