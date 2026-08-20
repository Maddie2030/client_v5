import logging
import re

from fastapi import status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from shared import get_redis, verify_image_token

log = logging.getLogger(__name__)
PUBLIC_THUMBNAIL = re.compile(
    r"^/images/[a-z0-9]+(?:-[a-z0-9]+)*/thumbnail-[a-f0-9]+\.webp$"
)


class HMACValidationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not path.startswith("/images/"):
            return await call_next(request)
        # Catalog thumbnails are public artwork. Chapter pages still require
        # signed tokens, while hotlink protection remains enabled for both.
        if PUBLIC_THUMBNAIL.fullmatch(path):
            return await call_next(request)

        token = request.query_params.get("token")
        if not token:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Missing token. Access denied."},
            )

        image_path = path[len("/images/"):]
        try:
            redis = await get_redis()
            is_valid = await verify_image_token(redis, token, image_path)
        except Exception:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Token verification error."},
            )

        if not is_valid:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Invalid or expired token."},
            )
        return await call_next(request)
