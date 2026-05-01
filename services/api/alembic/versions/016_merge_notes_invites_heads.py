"""merge notes and invites heads

Revision ID: 016_merge_notes_invites_heads
Revises: 010_notes, 015_invite_usage_limits
Create Date: 2026-04-08
"""

from typing import Sequence

# revision identifiers, used by Alembic.
revision: str = "016_merge_notes_invites_heads"
down_revision: str | Sequence[str] | None = ("010_notes", "015_invite_usage_limits")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Merge revision: schema changes are already applied in parent branches.
    pass


def downgrade() -> None:
    # Merge revision: no-op on downgrade.
    pass
