from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "019_reminders"
down_revision = "018_budget_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reminders",
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
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "is_personal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "repeat_rule",
            sa.Enum("none", "daily", "weekly", "monthly", name="reminder_repeat_rule"),
            nullable=False,
            server_default=sa.text("'none'"),
        ),
        sa.Column(
            "is_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_reminders_family_id", "reminders", ["family_id"])
    op.create_index("ix_reminders_author_id", "reminders", ["author_id"])
    op.create_index("ix_reminders_remind_at", "reminders", ["remind_at"])
    op.create_index(
        "ix_reminders_dispatch",
        "reminders",
        ["reminder_sent_at", "remind_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_reminders_dispatch", table_name="reminders")
    op.drop_index("ix_reminders_remind_at", table_name="reminders")
    op.drop_index("ix_reminders_author_id", table_name="reminders")
    op.drop_index("ix_reminders_family_id", table_name="reminders")
    op.drop_table("reminders")
    sa.Enum(name="reminder_repeat_rule").drop(op.get_bind(), checkfirst=True)
