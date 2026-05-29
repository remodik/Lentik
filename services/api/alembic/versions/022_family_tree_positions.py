from alembic import op
import sqlalchemy as sa

revision = "022_family_tree_positions"
down_revision = "021_family_tree"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "family_tree_persons",
        sa.Column("pos_x", sa.Float(), nullable=True),
    )
    op.add_column(
        "family_tree_persons",
        sa.Column("pos_y", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("family_tree_persons", "pos_y")
    op.drop_column("family_tree_persons", "pos_x")
