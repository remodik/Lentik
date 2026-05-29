"""Add users.password_changed_at for stateless JWT revocation.

Stores the timestamp of the last password (PIN) change or forced
session revocation. The auth layer rejects any JWT whose `iat` is
earlier than this value, giving logout/change-pin real effect on a
stateless HS256 token (CWE-613).
"""

import sqlalchemy as sa
from alembic import op


revision = "024_user_password_changed_at"
down_revision = "023_gallery_file_media_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "password_changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
