from alembic import op
import sqlalchemy as sa

revision = "004_display_name"
down_revision = "003_profile_and_edit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(64), nullable=True))

    op.execute("UPDATE users SET display_name = username WHERE display_name IS NULL")

    op.alter_column("users", "display_name", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "display_name")