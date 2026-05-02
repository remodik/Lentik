from alembic import op
import sqlalchemy as sa

revision = "020_chat_channel_settings"
down_revision = "019_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "chats",
        sa.Column(
            "slow_mode_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "chats",
        sa.Column(
            "is_18plus",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.add_column(
        "channels",
        sa.Column(
            "slow_mode_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "channels",
        sa.Column(
            "is_18plus",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("channels", "is_18plus")
    op.drop_column("channels", "slow_mode_seconds")
    op.drop_column("chats", "is_18plus")
    op.drop_column("chats", "slow_mode_seconds")
    op.drop_column("chats", "description")
