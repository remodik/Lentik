from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "007_message_mentions"
down_revision = "006_gallery_file_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("mentions", ARRAY(sa.String), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("messages", "mentions")