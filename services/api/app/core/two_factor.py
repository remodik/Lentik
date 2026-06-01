"""Точка расширения под второй фактор аутентификации (2FA).

TODO (когда будем добавлять 2FA, например TOTP или одноразовый код на e-mail):
  1. Хранить у User: ``two_factor_enabled: bool`` и ``two_factor_secret``.
  2. Реализовать ``verify_second_factor(user, code) -> bool``.
  3. В ``login_by_pin`` после успешной проверки PIN: если ``second_factor_required``
     → не выдавать cookie сразу, а вернуть «нужен второй фактор» + краткоживущий
     challenge-токен; подтверждение — отдельным эндпоинтом ``POST /auth/2fa``.
  4. Учитывать 2FA в смене PIN и при входе по приглашению.
"""

from __future__ import annotations

from app.models.user import User


async def second_factor_required(user: User) -> bool:
    """Нужен ли пользователю второй фактор. Пока всегда False (2FA выключено)."""
    return False
