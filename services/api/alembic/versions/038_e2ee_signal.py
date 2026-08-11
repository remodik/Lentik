"""E2EE (ADR-004): encryption_protocol на chats, реестр устройств, prekeys, mailbox.

Все крипто-поля — BYTEA (opaque): публичные ключи и pairwise-зашифрованные
блобы. Схема БД не привязана к структурам Signal Protocol — при переходе на
MLS меняется только значение enum, таблицы остаются теми же.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "038_e2ee_signal"
# Заодно merge двух head'ов (основная ветка + ветка ботов) — граф снова линейный.
down_revision = ("036_push_subscriptions", "037_preset_bots")
branch_labels = None
depends_on = None


ENCRYPTION_PROTOCOL = postgresql.ENUM(
    "signal", "mls", name="encryption_protocol", create_type=False
)


def upgrade() -> None:
    ENCRYPTION_PROTOCOL.create(op.get_bind(), checkfirst=True)

    # NULL = обычный чат. Значение выставляется только при создании чата.
    op.add_column(
        "chats",
        sa.Column("encryption_protocol", ENCRYPTION_PROTOCOL, nullable=True),
    )

    op.create_table(
        "e2ee_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("registration_id", sa.BigInteger(), nullable=False),
        sa.Column("identity_key", sa.LargeBinary(), nullable=False),
        sa.Column("signed_prekey_id", sa.Integer(), nullable=False),
        sa.Column("signed_prekey", sa.LargeBinary(), nullable=False),
        sa.Column("signed_prekey_signature", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "device_id", name="uq_e2ee_devices_user_device"),
    )
    op.create_index("ix_e2ee_devices_user_id", "e2ee_devices", ["user_id"])

    op.create_table(
        "e2ee_one_time_prekeys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "device_pk",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("e2ee_devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key_id", sa.Integer(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.UniqueConstraint("device_pk", "key_id", name="uq_e2ee_otp_device_key"),
    )
    op.create_index(
        "ix_e2ee_one_time_prekeys_device_pk", "e2ee_one_time_prekeys", ["device_pk"]
    )

    op.create_table(
        "e2ee_mailbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipient_device_pk",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("e2ee_devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_device_id", sa.Integer(), nullable=False),
        sa.Column(
            "chat_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chats.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_e2ee_mailbox_recipient_device_pk", "e2ee_mailbox", ["recipient_device_pk"]
    )


def downgrade() -> None:
    op.drop_index("ix_e2ee_mailbox_recipient_device_pk", table_name="e2ee_mailbox")
    op.drop_table("e2ee_mailbox")
    op.drop_index(
        "ix_e2ee_one_time_prekeys_device_pk", table_name="e2ee_one_time_prekeys"
    )
    op.drop_table("e2ee_one_time_prekeys")
    op.drop_index("ix_e2ee_devices_user_id", table_name="e2ee_devices")
    op.drop_table("e2ee_devices")
    op.drop_column("chats", "encryption_protocol")
    ENCRYPTION_PROTOCOL.drop(op.get_bind(), checkfirst=True)
