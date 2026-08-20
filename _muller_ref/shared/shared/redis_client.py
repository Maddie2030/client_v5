import redis.asyncio as aioredis

from .config import settings

_redis_pool: aioredis.ConnectionPool | None = None


def init_redis_pool() -> None:
    global _redis_pool
    _redis_pool = aioredis.ConnectionPool.from_url(
        settings.REDIS_URL, max_connections=20, decode_responses=True,
    )


async def close_redis_pool() -> None:
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None


async def get_redis() -> aioredis.Redis:
    if _redis_pool is None:
        init_redis_pool()
    return aioredis.Redis(connection_pool=_redis_pool)
