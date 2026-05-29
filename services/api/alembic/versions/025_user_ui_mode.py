"""Add users.ui_mode for "simple" / "advanced" UI preference.

Хранит предпочтение пользователя по сложности интерфейса.
В «advanced» открываются вкладки настроек семьи (роли, журнал и т.д.)
и другие гик-фичи.
"""

import sqlalchemy as sa
from alembic import op


revision = "025_user_ui_mode"
down_revision = "024_user_password_changed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "ui_mode",
            sa.String(length=16),
            server_default=sa.text("'simple'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "ui_mode")
