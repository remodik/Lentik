from alembic import op
import sqlalchemy as sa

revision = "014_calendar_event_reminders"
down_revision = "013_chat_pinned_message"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("reminder_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_calendar_events_reminder_sent_at",
        "calendar_events",
        ["reminder_sent_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_reminder_sent_at", table_name="calendar_events")
    op.drop_column("calendar_events", "reminder_sent_at")
    op.drop_column("calendar_events", "reminder_minutes")
