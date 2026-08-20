import logging
import re
import shutil
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from shared import (
    AsyncSessionLocal,
    Chapter,
    Page,
    Series,
    notify_series_followers,
    require_admin,
    settings,
)
from app.services.image_processor import convert_image_to_webp, process_archive

router = APIRouter(tags=["upload"])
log = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 500 * 1024 * 1024
MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024
SAFE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
THUMBNAIL_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}
THUMBNAIL_NAME = re.compile(r"^thumbnail-[a-f0-9]+\.webp$")


class PageMetadata(BaseModel):
    page_number: int
    image_path: str
    width: int
    height: int
    file_size: int


class UploadResponse(BaseModel):
    success: bool
    series_slug: str
    chapter_slug: str
    chapter_id: str
    page_count: int
    pages: list[PageMetadata]
    total_size_bytes: int


async def _get_series_by_slug(db: AsyncSession, slug: str) -> Series | None:
    result = await db.execute(select(Series).where(Series.slug == slug))
    return result.scalar_one_or_none()


async def _get_existing_chapter(
    db: AsyncSession,
    series_id: uuid.UUID,
    chapter_slug: str,
    chapter_number: float,
) -> Chapter | None:
    result = await db.execute(
        select(Chapter).where(
            Chapter.series_id == series_id,
            or_(
                Chapter.slug == chapter_slug,
                Chapter.chapter_number == Decimal(str(chapter_number)),
            ),
        )
    )
    return result.scalars().first()


async def _lock_series_upload(db: AsyncSession, series_id: uuid.UUID) -> None:
    """Serialize uploads for a series before processing files into its storage tree."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": f"chapter-upload:{series_id}"},
    )


def _chapter_storage_dir(series_slug: str, chapter_slug: str) -> Path:
    if not SAFE_SLUG.fullmatch(series_slug) or not SAFE_SLUG.fullmatch(chapter_slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid series or chapter slug.")
    return Path(settings.STORAGE_PATH) / series_slug / chapter_slug


@router.delete("/{series_slug}/{chapter_slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter_files(
    series_slug: str,
    chapter_slug: str,
    _admin: dict = Depends(require_admin),
) -> None:
    """Remove the image files for a chapter after its catalog record is deleted."""
    chapter_dir = _chapter_storage_dir(series_slug, chapter_slug)
    if chapter_dir.exists():
        shutil.rmtree(chapter_dir)


@router.post("/series/{series_slug}/thumbnail", status_code=status.HTTP_201_CREATED)
async def upload_series_thumbnail(
    series_slug: str,
    _admin: dict = Depends(require_admin),
    file: UploadFile = File(...),
) -> dict:
    """Store a versioned WebP thumbnail so replacement never serves stale browser cache."""
    if file.content_type not in THUMBNAIL_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only JPEG, PNG, WebP, GIF, BMP, or TIFF images are accepted.",
        )

    image_data = await file.read()
    if len(image_data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded thumbnail is empty.")
    if len(image_data) > MAX_THUMBNAIL_SIZE:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Thumbnail file is too large.")

    if not SAFE_SLUG.fullmatch(series_slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid series slug.")

    series_dir = Path(settings.STORAGE_PATH) / series_slug
    series_dir.mkdir(parents=True, exist_ok=True)
    try:
        webp_data, width, height = convert_image_to_webp(image_data)
    except Exception as e:
        log.warning("Thumbnail processing failed for %s: %s", series_slug, e)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Could not process thumbnail image.")

    thumbnail_name = f"thumbnail-{uuid.uuid4().hex}.webp"
    thumbnail_path = series_dir / thumbnail_name
    thumbnail_path.write_bytes(webp_data)

    return {
        "success": True,
        "image_path": f"{series_slug}/{thumbnail_name}",
        "width": width,
        "height": height,
        "file_size": len(webp_data),
    }


@router.delete(
    "/series/{series_slug}/thumbnail/{thumbnail_name}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_series_thumbnail(
    series_slug: str,
    thumbnail_name: str,
    _admin: dict = Depends(require_admin),
) -> None:
    if not SAFE_SLUG.fullmatch(series_slug) or not THUMBNAIL_NAME.fullmatch(thumbnail_name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid thumbnail path.")

    thumbnail_path = Path(settings.STORAGE_PATH) / series_slug / thumbnail_name
    if thumbnail_path.exists():
        thumbnail_path.unlink()


@router.post(
    "/upload/{series_slug}/{chapter_slug}",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_chapter_archive(
    series_slug: str,
    chapter_slug: str,
    _admin: dict = Depends(require_admin),
    file: UploadFile = File(...),
    chapter_number: float = 1.0,
    title: str | None = None,
) -> UploadResponse:

    if file.content_type not in (
        "application/zip", "application/x-zip-compressed",
        "application/x-cbz", "application/octet-stream",
    ):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only ZIP/CBZ archives accepted.")

    archive_data = await file.read()
    if len(archive_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large.")
    if len(archive_data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

    _chapter_storage_dir(series_slug, chapter_slug)
    files_created = False
    async with AsyncSessionLocal() as db:
        try:
            series = await _get_series_by_slug(db, series_slug)
            if series is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Series '{series_slug}' not found.")

            await _lock_series_upload(db, series.id)
            existing = await _get_existing_chapter(
                db, series.id, chapter_slug, chapter_number
            )
            if existing is not None:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This chapter already exists. Choose a new chapter number and slug "
                    "instead of replacing the existing upload.",
                )

            files_created = True
            try:
                pages = process_archive(archive_data, series_slug, chapter_slug)
            except ValueError as e:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
            except Exception as e:
                log.error("Archive processing failed: %s", e, exc_info=True)
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "Failed to process archive.",
                )
            chapter = Chapter(
                series_id=series.id,
                chapter_number=Decimal(str(chapter_number)),
                title=title,
                slug=chapter_slug,
                status="published",
                page_count=len(pages),
            )
            db.add(chapter)
            await db.flush()

            for p in pages:
                db.add(Page(
                    chapter_id=chapter.id,
                    page_number=p["page_number"],
                    image_path=p["image_path"],
                    width=p["width"],
                    height=p["height"],
                ))
            await db.flush()
            await notify_series_followers(
                db,
                series_id=chapter.series_id,
                chapter_id=chapter.id,
                chapter_number=chapter.chapter_number,
                chapter_title=chapter.title,
            )
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This chapter already exists. Choose a new chapter number and slug "
                    "instead of replacing the existing upload.",
                )
        except HTTPException:
            if files_created:
                shutil.rmtree(
                    _chapter_storage_dir(series_slug, chapter_slug),
                    ignore_errors=True,
                )
            raise
        except Exception as e:
            await db.rollback()
            if files_created:
                shutil.rmtree(
                    _chapter_storage_dir(series_slug, chapter_slug),
                    ignore_errors=True,
                )
            log.error("Database error during upload: %s", e, exc_info=True)
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to save chapter to database.")

    total_size = sum(p["file_size"] for p in pages)
    return UploadResponse(
        success=True, series_slug=series_slug, chapter_slug=chapter_slug,
        chapter_id=str(chapter.id),
        page_count=len(pages), pages=[PageMetadata(**p) for p in pages],
        total_size_bytes=total_size,
    )
