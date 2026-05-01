from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "018_budget_transactions"
down_revision = "017_expenses_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_transactions",
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
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "paid_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "type",
            sa.Enum("income", "expense", name="budget_tx_type"),
            nullable=False,
        ),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "currency",
            sa.String(8),
            nullable=False,
            server_default=sa.text("'RUB'"),
        ),
        sa.Column("description", sa.String(300), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("amount > 0", name="ck_budget_tx_amount_positive"),
    )
    op.create_index(
        "ix_budget_transactions_family_id",
        "budget_transactions",
        ["family_id"],
    )
    op.create_index(
        "ix_budget_transactions_family_occurred_on",
        "budget_transactions",
        ["family_id", "occurred_on"],
    )

    op.create_table(
        "budget_transaction_splits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("budget_transactions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("share", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint("share > 0", name="ck_budget_split_share_positive"),
        sa.UniqueConstraint(
            "transaction_id",
            "user_id",
            name="uq_budget_split_tx_user",
        ),
    )
    op.create_index(
        "ix_budget_transaction_splits_transaction_id",
        "budget_transaction_splits",
        ["transaction_id"],
    )

    # Триггер: если у транзакции есть splits, их сумма должна совпадать с amount.
    # Если splits отсутствуют — транзакция считается личной/общей без деления, проверка пропускается.
    op.execute(
        """
        CREATE FUNCTION check_budget_splits_sum()
        RETURNS TRIGGER AS $$
        DECLARE
            target_tx_id UUID;
            splits_sum NUMERIC(14, 2);
            splits_count INT;
            tx_amount NUMERIC(14, 2);
        BEGIN
            IF TG_TABLE_NAME = 'budget_transactions' THEN
                target_tx_id := COALESCE(NEW.id, OLD.id);
            ELSE
                target_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
            END IF;

            SELECT amount
            INTO tx_amount
            FROM budget_transactions
            WHERE id = target_tx_id;

            IF tx_amount IS NULL THEN
                RETURN NULL;
            END IF;

            SELECT COALESCE(SUM(share), 0)::NUMERIC(14, 2), COUNT(*)
            INTO splits_sum, splits_count
            FROM budget_transaction_splits
            WHERE transaction_id = target_tx_id;

            IF splits_count = 0 THEN
                RETURN NULL;
            END IF;

            IF splits_sum <> tx_amount THEN
                RAISE EXCEPTION 'Budget splits sum (%) must equal transaction amount (%)', splits_sum, tx_amount
                    USING ERRCODE = '23514';
            END IF;

            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER budget_splits_sum_check
        AFTER INSERT OR UPDATE OR DELETE ON budget_transaction_splits
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION check_budget_splits_sum();
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER budget_amount_sum_check
        AFTER UPDATE OF amount ON budget_transactions
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION check_budget_splits_sum();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS budget_amount_sum_check ON budget_transactions")
    op.execute("DROP TRIGGER IF EXISTS budget_splits_sum_check ON budget_transaction_splits")
    op.execute("DROP FUNCTION IF EXISTS check_budget_splits_sum")
    op.drop_index(
        "ix_budget_transaction_splits_transaction_id",
        table_name="budget_transaction_splits",
    )
    op.drop_table("budget_transaction_splits")
    op.drop_index(
        "ix_budget_transactions_family_occurred_on",
        table_name="budget_transactions",
    )
    op.drop_index(
        "ix_budget_transactions_family_id",
        table_name="budget_transactions",
    )
    op.drop_table("budget_transactions")
    sa.Enum(name="budget_tx_type").drop(op.get_bind(), checkfirst=True)
