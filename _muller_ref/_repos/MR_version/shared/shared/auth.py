import httpx
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

from .config import settings
from .redis_client import get_redis
from .session import get_session

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id, "username": username, "role": role,
        "iat": int(now.timestamp()), "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str, remote_ip: str | None = None) -> bool:
    if not settings.TURNSTILE_SECRET_KEY:
        return True
    data = {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=data)
            resp.raise_for_status()
            return bool(resp.json().get("success", False))
    except Exception:
        return False


async def get_current_user(
    request: Request, redis=Depends(get_redis)
) -> dict:
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    session_data = await get_session(redis, session_id)
    if session_data is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return session_data


async def get_current_user_optional(
    request: Request, redis=Depends(get_redis)
) -> dict | None:
    session_id = request.cookies.get("session_id")
    if not session_id:
        return None
    return await get_session(redis, session_id)


def require_role(*roles: str):
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user
    return _check


require_user = require_role("user", "admin")
require_admin = require_role("admin")
