"""Permission overrides на каналы и чаты.

Каждая запись задаёт для конкретной роли в конкретном канале/чате
битовые поля allow/deny, которые применяются поверх базовых прав роли.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "028_permission_overrides"
down_revision = "027_admin_bit_to_31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "channel_permission_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "channel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("channels.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("allow", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("deny", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("channel_id", "role_id", name="uq_channel_role_override"),
    )
    op.create_index(
        "ix_channel_permission_overrides_channel_id",
        "channel_permission_overrides",
        ["channel_id"],
    )
    op.create_index(
        "ix_channel_permission_overrides_role_id",
        "channel_permission_overrides",
        ["role_id"],
    )

    op.create_table(
        "chat_permission_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "chat_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chats.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("allow", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("deny", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("chat_id", "role_id", name="uq_chat_role_override"),
    )
    op.create_index(
        "ix_chat_permission_overrides_chat_id",
        "chat_permission_overrides",
        ["chat_id"],
    )
    op.create_index(
        "ix_chat_permission_overrides_role_id",
        "chat_permission_overrides",
        ["role_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_chat_permission_overrides_role_id",
        table_name="chat_permission_overrides",
    )
    op.drop_index(
        "ix_chat_permission_overrides_chat_id",
        table_name="chat_permission_overrides",
    )
    op.drop_table("chat_permission_overrides")
    op.drop_index(
        "ix_channel_permission_overrides_role_id",
        table_name="channel_permission_overrides",
    )
    op.drop_index(
        "ix_channel_permission_overrides_channel_id",
        table_name="channel_permission_overrides",
    )
    op.drop_table("channel_permission_overrides")
