from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "021_family_tree"
down_revision = "020_chat_channel_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "family_tree_persons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("avatar_url", sa.String(1024), nullable=True),
        sa.Column(
            "gender",
            sa.Enum("male", "female", "other", "unknown", name="family_tree_gender"),
            nullable=False,
            server_default=sa.text("'unknown'"),
        ),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("death_date", sa.Date(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("family_id", "user_id", name="uq_tree_family_user"),
    )
    op.create_index(
        "ix_family_tree_persons_family_id",
        "family_tree_persons",
        ["family_id"],
    )

    op.create_table(
        "family_tree_relations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "person_a_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_tree_persons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "person_b_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_tree_persons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "relation_type",
            sa.Enum("parent", "spouse", name="family_tree_relation_type"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "family_id",
            "person_a_id",
            "person_b_id",
            "relation_type",
            name="uq_tree_relation",
        ),
    )
    op.create_index(
        "ix_family_tree_relations_family_id",
        "family_tree_relations",
        ["family_id"],
    )
    op.create_index(
        "ix_family_tree_relations_person_a_id",
        "family_tree_relations",
        ["person_a_id"],
    )
    op.create_index(
        "ix_family_tree_relations_person_b_id",
        "family_tree_relations",
        ["person_b_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_family_tree_relations_person_b_id", table_name="family_tree_relations"
    )
    op.drop_index(
        "ix_family_tree_relations_person_a_id", table_name="family_tree_relations"
    )
    op.drop_index(
        "ix_family_tree_relations_family_id", table_name="family_tree_relations"
    )
    op.drop_table("family_tree_relations")
    sa.Enum(name="family_tree_relation_type").drop(op.get_bind(), checkfirst=True)

    op.drop_index(
        "ix_family_tree_persons_family_id", table_name="family_tree_persons"
    )
    op.drop_table("family_tree_persons")
    sa.Enum(name="family_tree_gender").drop(op.get_bind(), checkfirst=True)
