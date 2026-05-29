"""Роли и привязки участников.

Создаёт:
  * family_roles — роль с битовым полем прав
  * member_roles — назначение роли участнику

Авто-сидит 6 пресет-ролей (owner / coowner / parent / teen / child / everyone)
для каждой существующей семьи. Владельцу присваивается роль owner,
обычным участникам — child + everyone.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "026_family_roles"
down_revision = "025_user_ui_mode"
branch_labels = None
depends_on = None


# Дублируем константы здесь, чтобы миграция не зависела от изменений в app.core
_OWNER = 1 << 62
_BITS = lambda *bs: sum(1 << b for b in bs)
_EVERYONE = _BITS(0, 1, 2, 3, 4, 5, 7, 8)
_CHILD = _BITS(0, 1, 2, 5, 8)
_TEEN = _BITS(0, 1, 2, 3, 4, 5, 7, 8)
_PARENT = _BITS(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 17, 18, 19)
_COOWNER = _BITS(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19)

PRESETS = [
    ("owner", "Владелец", "#f59e0b", 0, _OWNER, True),
    ("coowner", "Со-владелец", "#ef4444", 10, _COOWNER, False),
    ("parent", "Родитель", "#10b981", 20, _PARENT, False),
    ("teen", "Подросток", "#3b82f6", 30, _TEEN, False),
    ("child", "Ребёнок", "#8b5cf6", 40, _CHILD, False),
    ("everyone", "@everyone", "#a1a1aa", 100, _EVERYONE, True),
]


def upgrade() -> None:
    op.create_table(
        "family_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False, server_default="#a1a1aa"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("permissions", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("is_preset", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_everyone", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("family_id", "slug", name="uq_family_role_slug"),
    )
    op.create_index("ix_family_roles_family_id", "family_roles", ["family_id"])

    op.create_table(
        "member_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "membership_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("memberships.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("membership_id", "role_id", name="uq_member_role"),
    )
    op.create_index("ix_member_roles_membership_id", "member_roles", ["membership_id"])
    op.create_index("ix_member_roles_role_id", "member_roles", ["role_id"])

    # Сидим пресеты для каждой существующей семьи + раскладываем дефолты участникам.
    conn = op.get_bind()
    families = conn.execute(sa.text("SELECT id FROM families")).fetchall()
    for (family_id,) in families:
        _seed_for_family(conn, family_id)


def _seed_for_family(conn, family_id):
    import uuid as _uuid

    role_ids: dict[str, _uuid.UUID] = {}
    for slug, name, color, priority, perms, is_system in PRESETS:
        role_id = _uuid.uuid4()
        role_ids[slug] = role_id
        conn.execute(
            sa.text(
                """
                INSERT INTO family_roles
                    (id, family_id, slug, name, color, priority, permissions,
                     is_preset, is_everyone, is_system, created_at)
                VALUES
                    (:id, :family_id, :slug, :name, :color, :priority, :permissions,
                     true, :is_everyone, :is_system, now())
                """
            ),
            {
                "id": role_id,
                "family_id": family_id,
                "slug": slug,
                "name": name,
                "color": color,
                "priority": priority,
                "permissions": perms,
                "is_everyone": slug == "everyone",
                "is_system": is_system,
            },
        )

    # Назначаем роли участникам: owner-membership → owner; остальные → child; всем → everyone.
    members = conn.execute(
        sa.text("SELECT id, role FROM memberships WHERE family_id = :fid"),
        {"fid": family_id},
    ).fetchall()
    for membership_id, role_value in members:
        target_slug = "owner" if role_value == "owner" else "child"
        conn.execute(
            sa.text(
                "INSERT INTO member_roles (id, membership_id, role_id, assigned_at) "
                "VALUES (:id, :mid, :rid, now())"
            ),
            {
                "id": _uuid.uuid4(),
                "mid": membership_id,
                "rid": role_ids[target_slug],
            },
        )
        conn.execute(
            sa.text(
                "INSERT INTO member_roles (id, membership_id, role_id, assigned_at) "
                "VALUES (:id, :mid, :rid, now())"
            ),
            {
                "id": _uuid.uuid4(),
                "mid": membership_id,
                "rid": role_ids["everyone"],
            },
        )


def downgrade() -> None:
    op.drop_index("ix_member_roles_role_id", table_name="member_roles")
    op.drop_index("ix_member_roles_membership_id", table_name="member_roles")
    op.drop_table("member_roles")
    op.drop_index("ix_family_roles_family_id", table_name="family_roles")
    op.drop_table("family_roles")
