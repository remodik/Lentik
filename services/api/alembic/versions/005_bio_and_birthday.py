from alembic import op
import sqlalchemy as sa

revision = "005_bio_and_birthday"
down_revision = "004_display_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.Text, nullable=True))
    op.add_column("users", sa.Column("birthday", sa.Date, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "birthday")
    op.drop_column("users", "bio")