from alembic import op
import sqlalchemy as sa

revision = "003_profile_and_edit"
down_revision = "002_messenger_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(1024), nullable=True))

    op.add_column("messages", sa.Column("edited", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("messages", "edited")
    op.drop_column("users", "avatar_url")