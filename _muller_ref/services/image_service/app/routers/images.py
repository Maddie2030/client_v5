import logging
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse

from shared import settings

router = APIRouter(tags=["images"])
log = logging.getLogger(__name__)

MINIO_ENDPOINT = settings.MINIO_ENDPOINT
MINIO_PORT = settings.MINIO_PORT
MINIO_BUCKET = settings.MINIO_BUCKET


@router.get("/images/{image_path:path}")
async def serve_image(image_path: str) -> Response:
    if ".." in image_path or image_path.startswith("/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid image path")

    # MinIO-hosted images: path format is "minio/<bucket>/<objectKey>"
    if image_path.startswith("minio/"):
        return await _serve_minio_image(image_path)

    # Local filesystem images (original upload flow)
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


async def _serve_minio_image(image_path: str) -> Response:
    """Proxy an image stored in MinIO. Path format: minio/<bucket>/<objectKey>."""
    parts = image_path.split("/", 2)
    if len(parts) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid MinIO path")

    bucket = parts[1]
    object_key = parts[2]

    minio_url = f"http://{MINIO_ENDPOINT}:{MINIO_PORT}/{bucket}/{object_key}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(minio_url)
            if resp.status_code != 200:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found in MinIO")

            content_type = resp.headers.get("content-type", "image/webp")
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "X-Content-Type-Options": "nosniff",
                },
            )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Failed to fetch from MinIO")
