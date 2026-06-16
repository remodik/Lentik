import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.cookies import clear_auth_cookie, set_auth_cookie
from app.core.jwt import create_access_token
from app.core.rate_limit import (
    check_username_limiter,
    pin_failure_ip_limiter,
    pin_failure_limiter,
    register_ip_limiter,
)
from app.core.security import dummy_verify, hash_pin, verify_pin
from app.core.ws_tickets import ws_ticket_store
from app.db.deps import get_db
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.auth import JoinByInviteRequest, JoinByInviteResponse, RegisterRequest
from app.schemas.auth_pin import AuthPinRequest, AuthResponse
from app.services import login_throttle
from app.services.invites import consume_invite, lock_active_invite

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _generate_suggestions(base: str, db: AsyncSession, count: int = 3) -> list[str]:
    suggestions = []
    attempts = 0
    while len(suggestions) < count and attempts < 20:
        attempts += 1
        suffix = "".join(random.choices(string.digits + string.ascii_lowercase, k=3))
        candidate = f"{base}_{suffix}"
        taken = await db.scalar(select(User.id).where(User.username == candidate))
        if not taken:
            suggestions.append(candidate)
    return suggestions


def _set_jwt_cookie(response: Response, user: User) -> str:
    """Ставит JWT в httpOnly-cookie (параметры — в core/cookies) и возвращает его.

    Веб токен из тела НЕ берёт и хранит только cookie — иначе любой XSS украл бы
    его из localStorage (CWE-522). Нативный мобильный клиент cookie между
    рестартами не держит, а SecureStore (Keychain/Keystore) аппаратно защищён —
    ему токен отдаём в теле по явному opt-in заголовку (см. `_wants_token_in_body`).
    """
    token = create_access_token(user.id, not_before=user.password_changed_at)
    set_auth_cookie(response, token)
    return token


# Заголовок-флаг: клиент (мобильный) явно просит вернуть JWT в теле ответа для
# хранения в защищённом сторе и отправки как Bearer. Браузерный фронт его НЕ
# шлёт, поэтому для веба поведение неизменно (cookie-only).
_TOKEN_HEADER = "X-Auth-Return-Token"


def _wants_token_in_body(flag: str | None) -> bool:
    # Явный opt-in (allow-list): токен в теле только при явном утвердительном
    # значении. Любое прочее (опечатки, "off" и т.п.) — cookie-only, как веб.
    return bool(flag) and flag.strip().lower() in ("1", "true", "yes", "on")


@router.get("/check-username")
async def check_username(
    request: Request,
    username: str,
    db: AsyncSession = Depends(get_db),
):
    if not await check_username_limiter.allow(f"ip:{_client_ip(request)}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов, попробуйте позже",
        )
    taken = await db.scalar(select(User.id).where(User.username == username))
    if not taken:
        return {"available": True, "suggestions": []}
    suggestions = await _generate_suggestions(username, db)
    return {"available": False, "suggestions": suggestions}


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    x_auth_return_token: str | None = Header(default=None, alias=_TOKEN_HEADER),
):
    # Per-IP rate-limit против массового создания аккаунтов (CWE-770).
    # TODO (точка расширения): при необходимости добавить CAPTCHA на этом шаге.
    ip_key = f"register:{_client_ip(request)}"
    if not await register_ip_limiter.allow(ip_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много регистраций с этого адреса. Попробуйте позже.",
        )

    existing = await db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=409, detail="Логин уже занят")

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_pin(body.pin),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = _set_jwt_cookie(response, user)
    return AuthResponse(
        user_id=str(user.id),
        access_token=token if _wants_token_in_body(x_auth_return_token) else None,
    )


@router.post("/pin", response_model=AuthResponse)
async def login_by_pin(
    request: Request,
    body: AuthPinRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    x_auth_return_token: str | None = Header(default=None, alias=_TOKEN_HEADER),
):
    user_key = f"user:{body.username.lower()}"
    ip_key = f"ip:{_client_ip(request)}"

    # Персистентный лок-аут аккаунта (переживает рестарт, общий между воркерами).
    locked_for = await login_throttle.check_locked(db, body.username)
    if locked_for is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Аккаунт временно заблокирован из-за неудачных попыток входа.",
            headers={"Retry-After": str(locked_for)},
        )

    # Дополнительный per-IP «пол» (in-memory, против распылённого перебора).
    # Намеренно НЕ сбрасывается при успешном входе (L15): иначе перебор по
    # многим username с одного IP, прерываемый редкими успехами, обходил бы лимит.
    # Минус для общих IP (NAT/семья за роутером) считаем приемлемым; основная
    # защита аккаунта — персистентный per-username лок-аут выше.
    if await pin_failure_ip_limiter.count(ip_key) >= pin_failure_ip_limiter.limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много неудачных попыток. Попробуйте позже.",
        )

    user = await db.scalar(select(User).where(User.username == body.username))
    # verify_pin (pbkdf2) дорог; чтобы несуществующий логин не отвечал заметно
    # быстрее существующего, при отсутствии пользователя гоняем фиктивную проверку.
    if user is None:
        dummy_verify()
    if not user or not verify_pin(body.pin, user.password_hash):
        await pin_failure_ip_limiter.record(ip_key)
        locked_now, retry_after = await login_throttle.record_failure(db, body.username)
        if locked_now:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Аккаунт временно заблокирован из-за неудачных попыток входа.",
                headers={"Retry-After": str(retry_after)},
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверные данные")

    # Глобальный бан: не пускаем даже при верном PIN. Структурированный 403
    # (причина + срок) — отдельно от "неверные данные". Ленивое автоснятие
    # внутри enforce_not_banned.
    from app.services.bans import enforce_not_banned

    await enforce_not_banned(db, user)

    # Успех — сбрасываем счётчики. (TODO 2FA: здесь, если у пользователя включён
    # второй фактор, вход завершать отдельным шагом — см. core/two_factor.py.)
    await login_throttle.reset(db, body.username)
    await pin_failure_limiter.reset(user_key)
    token = _set_jwt_cookie(response, user)
    return AuthResponse(
        user_id=str(user.id),
        access_token=token if _wants_token_in_body(x_auth_return_token) else None,
    )


@router.post("/ws-ticket")
async def issue_ws_ticket(user: User = Depends(get_current_user)):
    """Выдать одноразовый короткоживущий тикет для WebSocket-handshake.

    Клиент открывает WS с `?ticket=<value>` вместо `?token=<JWT>`, чтобы
    долгоживущий JWT не попадал в URL/логи/Referer/историю браузера.
    """
    ticket, expires_in = await ws_ticket_store.issue(user.id)
    return {"ticket": ticket, "expires_in": expires_in}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Logout-everywhere: сдвигаем password_changed_at, чтобы любые ранее
    # выпущенные JWT этого пользователя перестали приниматься.
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    clear_auth_cookie(response)


@router.post("/invite", response_model=JoinByInviteResponse, status_code=status.HTTP_201_CREATED)
async def join_by_invite(
    body: JoinByInviteRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    x_auth_return_token: str | None = Header(default=None, alias=_TOKEN_HEADER),
):
    invite = await lock_active_invite(db, body.token)

    base = body.display_name.strip().lower().replace(" ", "_")
    username = base
    while await db.scalar(select(User.id).where(User.username == username)):
        suffix = "".join(random.choices(string.digits + string.ascii_lowercase, k=3))
        username = f"{base}_{suffix}"

    user = User(
        username=username,
        display_name=body.display_name.strip(),
        password_hash=hash_pin(body.pin),
    )
    db.add(user)
    await db.flush()

    membership = Membership(user_id=user.id, family_id=invite.family_id, role=Role.MEMBER)
    db.add(membership)
    await db.flush()

    from app.services.roles import assign_default_roles_on_join

    await assign_default_roles_on_join(db, membership)

    consume_invite(invite)
    await db.commit()

    from app.ws.manager import ws_manager
    await ws_manager.broadcast_to_family(
        invite.family_id,
        {
            "type": "member_joined",
            "user_id": str(user.id),
            "display_name": user.display_name,
        },
    )

    token = _set_jwt_cookie(response, user)
    return JoinByInviteResponse(
        user_id=user.id,
        family_id=invite.family_id,
        access_token=token if _wants_token_in_body(x_auth_return_token) else None,
    )
