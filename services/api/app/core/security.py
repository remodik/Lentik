from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
)

def hash_pin(pin: str) -> str:
    pin = str(pin)
    return pwd_context.hash(pin)

def verify_pin(pin: str, secret_hash: str) -> bool:
    pin = str(pin)
    return pwd_context.verify(pin, secret_hash)


# Заранее посчитанный хэш для «пустой» проверки. Нужен, чтобы при входе с
# несуществующим логином всё равно выполнялась дорогая операция verify и время
# ответа не отличалось от существующего аккаунта (защита от перечисления
# пользователей по таймингу, CWE-208).
_DUMMY_HASH = pwd_context.hash("0000")


def dummy_verify() -> None:
    """Выполнить фиктивную проверку PIN, чтобы выровнять время ответа."""
    pwd_context.verify("0000", _DUMMY_HASH)