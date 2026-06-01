"""Member permission overrides на каналы и чаты."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "030_member_permission_overrides"
down_revision = "029_audit_log"
branch_labels = None
depends_on = None


CHANNEL_TABLE = "channel_permission_overrides"
CHAT_TABLE = "chat_permission_overrides"


def upgrade() -> None:
    op.drop_constraint("uq_channel_role_override", CHANNEL_TABLE, type_="unique")
    op.drop_constraint("uq_chat_role_override", CHAT_TABLE, type_="unique")

    op.alter_column(CHANNEL_TABLE, "role_id", nullable=True)
    op.add_column(
        CHANNEL_TABLE,
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_channel_override_one_subject",
        CHANNEL_TABLE,
        "(role_id IS NOT NULL AND user_id IS NULL) OR "
        "(role_id IS NULL AND user_id IS NOT NULL)",
    )
    op.create_index(
        "uq_channel_permission_overrides_channel_role",
        CHANNEL_TABLE,
        ["channel_id", "role_id"],
        unique=True,
        postgresql_where=sa.text("role_id IS NOT NULL"),
    )
    op.create_index(
        "uq_channel_permission_overrides_channel_user",
        CHANNEL_TABLE,
        ["channel_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.create_index(
        "ix_channel_permission_overrides_user_id",
        CHANNEL_TABLE,
        ["user_id"],
    )

    op.alter_column(CHAT_TABLE, "role_id", nullable=True)
    op.add_column(
        CHAT_TABLE,
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_chat_override_one_subject",
        CHAT_TABLE,
        "(role_id IS NOT NULL AND user_id IS NULL) OR "
        "(role_id IS NULL AND user_id IS NOT NULL)",
    )
    op.create_index(
        "uq_chat_permission_overrides_chat_role",
        CHAT_TABLE,
        ["chat_id", "role_id"],
        unique=True,
        postgresql_where=sa.text("role_id IS NOT NULL"),
    )
    op.create_index(
        "uq_chat_permission_overrides_chat_user",
        CHAT_TABLE,
        ["chat_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.create_index(
        "ix_chat_permission_overrides_user_id",
        CHAT_TABLE,
        ["user_id"],
    )


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM {CHANNEL_TABLE} WHERE role_id IS NULL"))
    op.execute(sa.text(f"DELETE FROM {CHAT_TABLE} WHERE role_id IS NULL"))

    op.drop_index("ix_chat_permission_overrides_user_id", table_name=CHAT_TABLE)
    op.drop_index("uq_chat_permission_overrides_chat_user", table_name=CHAT_TABLE)
    op.drop_index("uq_chat_permission_overrides_chat_role", table_name=CHAT_TABLE)
    op.drop_constraint("ck_chat_override_one_subject", CHAT_TABLE, type_="check")
    op.drop_column(CHAT_TABLE, "user_id")
    op.alter_column(CHAT_TABLE, "role_id", nullable=False)
    op.create_unique_constraint(
        "uq_chat_role_override",
        CHAT_TABLE,
        ["chat_id", "role_id"],
    )

    op.drop_index("ix_channel_permission_overrides_user_id", table_name=CHANNEL_TABLE)
    op.drop_index(
        "uq_channel_permission_overrides_channel_user",
        table_name=CHANNEL_TABLE,
    )
    op.drop_index(
        "uq_channel_permission_overrides_channel_role",
        table_name=CHANNEL_TABLE,
    )
    op.drop_constraint("ck_channel_override_one_subject", CHANNEL_TABLE, type_="check")
    op.drop_column(CHANNEL_TABLE, "user_id")
    op.alter_column(CHANNEL_TABLE, "role_id", nullable=False)
    op.create_unique_constraint(
        "uq_channel_role_override",
        CHANNEL_TABLE,
        ["channel_id", "role_id"],
    )
