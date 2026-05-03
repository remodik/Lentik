from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.family_tree import (
    FamilyTreePerson,
    FamilyTreeRelation,
    TreeGender,
    TreeRelationType,
)
from app.models.membership import Membership
from app.models.user import User
from app.schemas.family_tree import (
    TreePersonCreate,
    TreePersonResponse,
    TreePersonUpdate,
    TreeRelationCreate,
    TreeRelationResponse,
    TreeResponse,
)
from app.services.family import require_membership

family_router = APIRouter(prefix="/families/{family_id}/tree", tags=["family-tree"])
person_router = APIRouter(prefix="/tree/persons", tags=["family-tree"])
relation_router = APIRouter(prefix="/tree/relations", tags=["family-tree"])


def _gender_value(value) -> str:
    return value.value if isinstance(value, TreeGender) else value


def _relation_value(value) -> str:
    return value.value if isinstance(value, TreeRelationType) else value


def _person_to_response(p: FamilyTreePerson) -> TreePersonResponse:
    return TreePersonResponse(
        id=p.id,
        family_id=p.family_id,
        user_id=p.user_id,
        display_name=p.display_name,
        avatar_url=p.avatar_url,
        gender=_gender_value(p.gender),
        birth_date=p.birth_date,
        death_date=p.death_date,
        bio=p.bio,
        pos_x=p.pos_x,
        pos_y=p.pos_y,
        created_at=p.created_at,
    )


def _relation_to_response(r: FamilyTreeRelation) -> TreeRelationResponse:
    return TreeRelationResponse(
        id=r.id,
        family_id=r.family_id,
        person_a_id=r.person_a_id,
        person_b_id=r.person_b_id,
        relation_type=_relation_value(r.relation_type),
        created_at=r.created_at,
    )


async def _load_person(person_id: UUID, db: AsyncSession) -> FamilyTreePerson:
    person = await db.get(FamilyTreePerson, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@family_router.get("", response_model=TreeResponse)
async def get_tree(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    persons = await db.scalars(
        select(FamilyTreePerson)
        .where(FamilyTreePerson.family_id == family_id)
        .order_by(FamilyTreePerson.created_at)
    )
    relations = await db.scalars(
        select(FamilyTreeRelation)
        .where(FamilyTreeRelation.family_id == family_id)
        .order_by(FamilyTreeRelation.created_at)
    )

    return TreeResponse(
        persons=[_person_to_response(p) for p in persons.all()],
        relations=[_relation_to_response(r) for r in relations.all()],
    )


@family_router.post(
    "/persons",
    response_model=TreePersonResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_person(
    family_id: UUID,
    body: TreePersonCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    if body.user_id is not None:
        existing = await db.scalar(
            select(FamilyTreePerson).where(
                FamilyTreePerson.family_id == family_id,
                FamilyTreePerson.user_id == body.user_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Этот пользователь уже привязан к древу",
            )

    person = FamilyTreePerson(
        family_id=family_id,
        user_id=body.user_id,
        display_name=body.display_name,
        avatar_url=body.avatar_url,
        gender=TreeGender(body.gender),
        birth_date=body.birth_date,
        death_date=body.death_date,
        bio=body.bio,
        pos_x=body.pos_x,
        pos_y=body.pos_y,
    )
    db.add(person)
    await db.commit()
    await db.refresh(person)
    return _person_to_response(person)


@person_router.patch("/{person_id}", response_model=TreePersonResponse)
async def update_person(
    person_id: UUID,
    body: TreePersonUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    person = await _load_person(person_id, db)
    await require_membership(person.family_id, user, db)

    fields_set = body.model_fields_set

    if body.display_name is not None:
        person.display_name = body.display_name
    if body.avatar_url is not None:
        person.avatar_url = body.avatar_url
    if body.gender is not None:
        person.gender = TreeGender(body.gender)
    if body.bio is not None:
        person.bio = body.bio
    if "pos_x" in fields_set:
        person.pos_x = body.pos_x
    if "pos_y" in fields_set:
        person.pos_y = body.pos_y

    if body.clear_birth_date:
        person.birth_date = None
    elif body.birth_date is not None:
        person.birth_date = body.birth_date

    if body.clear_death_date:
        person.death_date = None
    elif body.death_date is not None:
        person.death_date = body.death_date

    if body.clear_user_link:
        person.user_id = None
    elif body.user_id is not None:
        if body.user_id != person.user_id:
            existing = await db.scalar(
                select(FamilyTreePerson).where(
                    FamilyTreePerson.family_id == person.family_id,
                    FamilyTreePerson.user_id == body.user_id,
                    FamilyTreePerson.id != person.id,
                )
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Этот пользователь уже привязан к другой карточке",
                )
        person.user_id = body.user_id

    await db.commit()
    await db.refresh(person)
    return _person_to_response(person)


@person_router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    person = await _load_person(person_id, db)
    await require_membership(person.family_id, user, db)

    await db.delete(person)
    await db.commit()


@family_router.post(
    "/relations",
    response_model=TreeRelationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_relation(
    family_id: UUID,
    body: TreeRelationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    if body.person_a_id == body.person_b_id:
        raise HTTPException(status_code=400, detail="Нельзя связать человека с самим собой")

    person_a = await _load_person(body.person_a_id, db)
    person_b = await _load_person(body.person_b_id, db)
    if person_a.family_id != family_id or person_b.family_id != family_id:
        raise HTTPException(status_code=400, detail="Персоны принадлежат другой семье")

    rel_type = TreeRelationType(body.relation_type)

    if rel_type == TreeRelationType.SPOUSE:
        a, b = sorted([body.person_a_id, body.person_b_id], key=str)
        existing = await db.scalar(
            select(FamilyTreeRelation).where(
                FamilyTreeRelation.family_id == family_id,
                FamilyTreeRelation.relation_type == TreeRelationType.SPOUSE,
                or_(
                    (FamilyTreeRelation.person_a_id == a)
                    & (FamilyTreeRelation.person_b_id == b),
                    (FamilyTreeRelation.person_a_id == b)
                    & (FamilyTreeRelation.person_b_id == a),
                ),
            )
        )
        if existing:
            raise HTTPException(status_code=409, detail="Связь уже существует")
        relation = FamilyTreeRelation(
            family_id=family_id,
            person_a_id=a,
            person_b_id=b,
            relation_type=rel_type,
        )
    else:
        if await _has_ancestor(body.person_a_id, body.person_b_id, family_id, db):
            raise HTTPException(
                status_code=400,
                detail="Связь приведёт к циклу в родословной",
            )
        existing = await db.scalar(
            select(FamilyTreeRelation).where(
                FamilyTreeRelation.family_id == family_id,
                FamilyTreeRelation.person_a_id == body.person_a_id,
                FamilyTreeRelation.person_b_id == body.person_b_id,
                FamilyTreeRelation.relation_type == TreeRelationType.PARENT,
            )
        )
        if existing:
            raise HTTPException(status_code=409, detail="Связь уже существует")
        relation = FamilyTreeRelation(
            family_id=family_id,
            person_a_id=body.person_a_id,
            person_b_id=body.person_b_id,
            relation_type=rel_type,
        )

    db.add(relation)
    await db.commit()
    await db.refresh(relation)
    return _relation_to_response(relation)


@relation_router.delete("/{relation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relation(
    relation_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    relation = await db.get(FamilyTreeRelation, relation_id)
    if not relation:
        raise HTTPException(status_code=404, detail="Relation not found")
    await require_membership(relation.family_id, user, db)

    await db.delete(relation)
    await db.commit()


async def _has_ancestor(
    descendant_id: UUID,
    candidate_ancestor_id: UUID,
    family_id: UUID,
    db: AsyncSession,
) -> bool:
    """True if descendant is already an ancestor of candidate (would create cycle)."""
    rows = await db.scalars(
        select(FamilyTreeRelation).where(
            FamilyTreeRelation.family_id == family_id,
            FamilyTreeRelation.relation_type == TreeRelationType.PARENT,
        )
    )
    parents_of: dict[UUID, list[UUID]] = {}
    for r in rows.all():
        parents_of.setdefault(r.person_b_id, []).append(r.person_a_id)

    stack = [candidate_ancestor_id]
    seen: set[UUID] = set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        if cur == descendant_id:
            return True
        stack.extend(parents_of.get(cur, []))
    return False
