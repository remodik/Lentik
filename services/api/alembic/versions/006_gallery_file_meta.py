from alembic import op
import sqlalchemy as sa

revision = "006_gallery_file_meta"
down_revision = "005_bio_and_birthday"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gallery_items", sa.Column("file_name", sa.String(256), nullable=True))
    op.add_column("gallery_items", sa.Column("file_size", sa.BigInteger, nullable=True))


def downgrade() -> None:
    op.drop_column("gallery_items", "file_size")
    op.drop_column("gallery_items", "file_name")