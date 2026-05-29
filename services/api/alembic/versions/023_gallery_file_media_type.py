"""Add 'file' value to gallery media_type enum.

Allows gallery_items to store generic files (documents, archives,
audio, etc.) alongside images and videos. The frontend renders these
in a dedicated "Files" tab.
"""

from alembic import op


revision = "023_gallery_file_media_type"
down_revision = "022_family_tree_positions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE media_type_enum ADD VALUE IF NOT EXISTS 'file'")


def downgrade() -> None:
    # Postgres does not support removing enum values without recreating the
    # type. Rows of type 'file' would be lost on downgrade, so we leave the
    # value in place. This is a one-way migration.
    pass
