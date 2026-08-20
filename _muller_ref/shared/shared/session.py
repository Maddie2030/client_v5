import json
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis

from .config import settings

SESSION_PREFIX = "session:"


def _key(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


async def create_session(
    redis: aioredis.Redis, user_id: str, username: str, role: str
) -> str:
    session_id = str(uuid.uuid4())
    payload = json.dumps(
        {
            "user_id": user_id,
            "username": username,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await redis.setex(_key(session_id), settings.SESSION_TTL_SECONDS, payload)
    return session_id


async def get_session(redis: aioredis.Redis, session_id: str) -> dict | None:
    raw = await redis.get(_key(session_id))
    if raw is None:
        return None
    return json.loads(raw)


async def delete_session(redis: aioredis.Redis, session_id: str) -> None:
    await redis.delete(_key(session_id))


async def refresh_session(redis: aioredis.Redis, session_id: str) -> bool:
    return bool(await redis.expire(_key(session_id), settings.SESSION_TTL_SECONDS))
