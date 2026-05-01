from alembic import op
import sqlalchemy as sa

revision = "015_invite_usage_limits"
down_revision = "014_calendar_event_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invites",
        sa.Column("max_uses", sa.Integer(), nullable=True),
    )
    op.add_column(
        "invites",
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("UPDATE invites SET max_uses = 1 WHERE max_uses IS NULL")
    op.alter_column(
        "invites",
        "max_uses",
        existing_type=sa.Integer(),
        nullable=False,
        server_default="1",
    )


def downgrade() -> None:
    op.drop_column("invites", "uses_count")
    op.drop_column("invites", "max_uses")
