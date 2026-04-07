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