from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "009_message_attachments"
down_revision = "008_calendar_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "attachments")
