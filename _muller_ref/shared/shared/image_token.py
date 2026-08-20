import base64
import hashlib
import hmac
import json
import time
import uuid

import redis.asyncio as aioredis

from .config import settings

IMAGE_TOKEN_PREFIX = "imgtoken:"


def _b64url_encode(data: str) -> str:
    return base64.urlsafe_b64encode(data.encode()).rstrip(b"=").decode()


def _b64url_decode(data: str) -> str:
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data).decode()


def _sign(payload: str) -> str:
    return hmac.new(
        settings.TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _redis_key(token: str) -> str:
    return f"{IMAGE_TOKEN_PREFIX}{_token_hash(token)}"


async def generate_image_token(
    redis: aioredis.Redis, path: str, user_id: str | None = None
) -> str:
    ttl = settings.IMAGE_TOKEN_TTL_SECONDS
    expires_at = int(time.time()) + ttl
    payload_dict = {
        "path": path,
        "exp": expires_at,
        "uid": user_id,
        "jti": str(uuid.uuid4()),
    }
    payload_b64 = _b64url_encode(json.dumps(payload_dict, separators=(",", ":")))
    signature = _sign(payload_b64)
    token = f"{payload_b64}.{signature}"
    store_value = json.dumps(
        {"path": path, "expires_at": expires_at, "user_id": user_id},
        separators=(",", ":"),
    )
    await redis.setex(_redis_key(token), ttl, store_value)
    return token


async def verify_image_token(
    redis: aioredis.Redis, token: str, path: str
) -> bool:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return False
        payload_b64, provided_sig = parts
        expected_sig = _sign(payload_b64)
        if not hmac.compare_digest(expected_sig, provided_sig):
            return False
        payload_dict = json.loads(_b64url_decode(payload_b64))
        if int(time.time()) > payload_dict.get("exp", 0):
            return False
        if payload_dict.get("path") != path:
            return False
        stored_raw = await redis.get(_redis_key(token))
        if stored_raw is None:
            return False
        stored = json.loads(stored_raw)
        if stored.get("path") != path:
            return False
    except Exception:
        return False
    return True


async def revoke_image_token(redis: aioredis.Redis, token: str) -> None:
    await redis.delete(_redis_key(token))


async def refresh_image_token(
    redis: aioredis.Redis, old_token: str, path: str, user_id: str | None = None
) -> str | None:
    if not await verify_image_token(redis, old_token, path):
        return None
    await revoke_image_token(redis, old_token)
    return await generate_image_token(redis, path, user_id)
