"""Персистентный лок-аут входа (login_throttle).

Также сводит две ветки миграций (030 и 031, обе от 029) в один head.
"""

import sqlalchemy as sa
from alembic import op


revision = "032_login_throttle"
down_revision = ("030_member_permission_overrides", "031_moderation_settings")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_throttle",
        sa.Column("username", sa.String(length=64), primary_key=True),
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lockout_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("login_throttle")
