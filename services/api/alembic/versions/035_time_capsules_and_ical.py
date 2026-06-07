"""Капсулы времени + токен iCal-подписки календаря."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "035_time_capsules_and_ical"
down_revision = "034_developer_and_bans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── iCal-подписка: секрет на семье ───────────────────────────────────────
    op.add_column(
        "families",
        sa.Column("calendar_feed_token", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_families_calendar_feed_token", "families", ["calendar_feed_token"]
    )

    # ── Капсулы времени ──────────────────────────────────────────────────────
    op.create_table(
        "time_capsules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("unlock_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "opened",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_time_capsules_family_id", "time_capsules", ["family_id"])

    op.create_table(
        "time_capsule_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "capsule_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("time_capsules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_time_capsule_entries_capsule_id", "time_capsule_entries", ["capsule_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_time_capsule_entries_capsule_id", table_name="time_capsule_entries")
    op.drop_table("time_capsule_entries")
    op.drop_index("ix_time_capsules_family_id", table_name="time_capsules")
    op.drop_table("time_capsules")
    op.drop_constraint("uq_families_calendar_feed_token", "families", type_="unique")
    op.drop_column("families", "calendar_feed_token")
