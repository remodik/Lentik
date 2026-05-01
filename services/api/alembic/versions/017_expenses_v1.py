from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017_expenses_v1"
down_revision = "016_merge_notes_invites_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False, server_default=sa.text("'RUB'")),
        sa.Column(
            "paid_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_family_id", "expenses", ["family_id"])

    op.create_table(
        "expense_splits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "expense_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("share", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("share > 0", name="ck_expense_splits_share_positive"),
    )
    op.create_index("ix_expense_splits_expense_id", "expense_splits", ["expense_id"])

    op.execute(
        """
        CREATE FUNCTION check_expense_splits_sum()
        RETURNS TRIGGER AS $$
        DECLARE
            target_expense_id UUID;
            splits_sum NUMERIC(10, 2);
            expense_amount NUMERIC(10, 2);
        BEGIN
            IF TG_TABLE_NAME = 'expenses' THEN
                target_expense_id := COALESCE(NEW.id, OLD.id);
            ELSE
                target_expense_id := COALESCE(NEW.expense_id, OLD.expense_id);
            END IF;

            SELECT amount
            INTO expense_amount
            FROM expenses
            WHERE id = target_expense_id;

            IF expense_amount IS NULL THEN
                RETURN NULL;
            END IF;

            SELECT COALESCE(SUM(share), 0)::NUMERIC(10, 2)
            INTO splits_sum
            FROM expense_splits
            WHERE expense_id = target_expense_id;

            IF splits_sum <> expense_amount THEN
                RAISE EXCEPTION 'Splits sum (%) must equal expense amount (%)', splits_sum, expense_amount
                    USING ERRCODE = '23514';
            END IF;

            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER expense_splits_sum_check
        AFTER INSERT OR UPDATE OR DELETE ON expense_splits
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION check_expense_splits_sum();
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER expense_amount_sum_check
        AFTER UPDATE OF amount ON expenses
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION check_expense_splits_sum();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS expense_amount_sum_check ON expenses")
    op.execute("DROP TRIGGER IF EXISTS expense_splits_sum_check ON expense_splits")
    op.execute("DROP FUNCTION IF EXISTS check_expense_splits_sum")
    op.drop_index("ix_expense_splits_expense_id", table_name="expense_splits")
    op.drop_table("expense_splits")
    op.drop_index("ix_expenses_family_id", table_name="expenses")
    op.drop_table("expenses")
