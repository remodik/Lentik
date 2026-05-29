"""Перенос ADMINISTRATOR-бита с 1<<62 на 1<<31.

Причина: 1<<62 = 4611686018427387904 > Number.MAX_SAFE_INTEGER (2^53),
поэтому JSON-ответ нельзя безопасно представить как JS Number без BigInt.
Сжимаем бит в пределы 32, чтобы поле permissions гарантированно влезало.
"""

import sqlalchemy as sa
from alembic import op


revision = "027_admin_bit_to_31"
down_revision = "026_family_roles"
branch_labels = None
depends_on = None


_OLD_ADMIN = 1 << 62
_NEW_ADMIN = 1 << 31


def upgrade() -> None:
    conn = op.get_bind()
    # Любая роль, у которой стоит бит 1<<62 — выставляем 1<<31 на его место.
    conn.execute(
        sa.text(
            "UPDATE family_roles "
            "SET permissions = (permissions & ~CAST(:old AS bigint)) | CAST(:new AS bigint) "
            "WHERE (permissions & CAST(:old AS bigint)) <> 0"
        ),
        {"old": _OLD_ADMIN, "new": _NEW_ADMIN},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE family_roles "
            "SET permissions = (permissions & ~CAST(:new AS bigint)) | CAST(:old AS bigint) "
            "WHERE (permissions & CAST(:new AS bigint)) <> 0"
        ),
        {"old": _OLD_ADMIN, "new": _NEW_ADMIN},
    )
