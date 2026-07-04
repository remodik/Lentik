"""Add messages.components (JSONB) for interactive components (Phase 3).

Stores button/select action rows attached to a message (usually by bots).
Default [] — existing messages have no components.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op


revision = "026_message_components"
down_revision = "025_bots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "components",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "components")
