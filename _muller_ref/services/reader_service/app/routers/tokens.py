from fastapi import APIRouter, Depends, HTTPException, Query, status

import redis.asyncio as aioredis

from shared import get_redis, refresh_image_token, settings

router = APIRouter(tags=["tokens"])


@router.get("/refresh")
async def refresh_token(
    path: str = Query(...),
    old_token: str = Query(...),
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    new_token = await refresh_image_token(redis, old_token, path, None)
    if new_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalid or expired")
    return {"token": new_token, "expires_in": settings.IMAGE_TOKEN_TTL_SECONDS}
