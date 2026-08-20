import logging
from urllib.parse import urlparse

from fastapi import status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from shared import settings

log = logging.getLogger(__name__)


def _get_allowed_origins() -> set[str]:
    origins = set()
    for origin in settings.ALLOWED_ORIGIN.split(","):
        origin = origin.strip()
        if origin:
            parsed = urlparse(origin)
            hostname = parsed.hostname or parsed.path
            if hostname:
                origins.add(hostname.lower())
    return origins


class HotlinkProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not path.startswith("/images/"):
            return await call_next(request)
        if settings.DEBUG:
            return await call_next(request)

        allowed = _get_allowed_origins()
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        request_origin: str | None = None

        if origin:
            request_origin = (urlparse(origin).hostname or "").lower()
        elif referer:
            request_origin = (urlparse(referer).hostname or "").lower()

        if not request_origin:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Hotlinking not allowed"},
            )
        if request_origin not in allowed:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Hotlinking not allowed"},
            )
        return await call_next(request)
