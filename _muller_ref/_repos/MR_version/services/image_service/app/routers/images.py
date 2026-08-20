import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from shared import settings

router = APIRouter(tags=["images"])
log = logging.getLogger(__name__)


@router.get("/images/{image_path:path}")
async def serve_image(image_path: str) -> FileResponse:
    if ".." in image_path or image_path.startswith("/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid image path")

    file_path = Path(settings.STORAGE_PATH) / image_path
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    resolved = file_path.resolve()
    storage_resolved = Path(settings.STORAGE_PATH).resolve()
    if not str(resolved).startswith(str(storage_resolved)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    return FileResponse(
        path=str(file_path),
        media_type="image/webp",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
