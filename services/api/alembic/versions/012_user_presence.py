from alembic import op
import sqlalchemy as sa

revision = "012_user_presence"
down_revision = "011_message_read_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_online",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.alter_column("users", "is_online", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "is_online")
