import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared import (
    get_db,
    require_admin,
    require_admin_or_service,
    Series,
    Chapter,
    Page,
    notify_series_followers,
)

router = APIRouter(tags=["chapters"])


class ChapterCreateRequest(BaseModel):
    chapter_number: float
    title: str | None = None
    slug: str
    status: Literal["draft", "published"] = "draft"


class PageCreateItem(BaseModel):
    page_number: int
    image_path: str
    width: int | None = None
    height: int | None = None


class PagesCreateRequest(BaseModel):
    pages: list[PageCreateItem]


class ChapterUpdateRequest(BaseModel):
    chapter_number: float | None = None
    title: str | None = None
    slug: str | None = None
    status: Literal["draft", "published"] | None = None


class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    series_id: str
    chapter_number: float
    title: str | None
    slug: str
    status: str
    page_count: int
    created_at: datetime
    updated_at: datetime


class PageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    chapter_id: str
    page_number: int
    image_path: str
    width: int | None
    height: int | None


class ChapterDetailResponse(ChapterResponse):
    pages: list[PageResponse] = []


async def _get_series_by_id(db: AsyncSession, series_id: str) -> Series | None:
    result = await db.execute(select(Series).where(Series.id == uuid.UUID(series_id)))
    return result.scalar_one_or_none()


async def _get_chapter_by_slug(db: AsyncSession, series_id: str, slug: str) -> Chapter | None:
    result = await db.execute(
        select(Chapter).where(
            Chapter.series_id == uuid.UUID(series_id), Chapter.slug == slug,
        )
    )
    return result.scalar_one_or_none()


async def _get_chapter_by_id(db: AsyncSession, chapter_id: str) -> Chapter | None:
    result = await db.execute(select(Chapter).where(Chapter.id == uuid.UUID(chapter_id)))
    return result.scalar_one_or_none()


async def _get_pages(db: AsyncSession, chapter_id: str) -> list[Page]:
    result = await db.execute(
        select(Page).where(Page.chapter_id == uuid.UUID(chapter_id)).order_by(Page.page_number)
    )
    return list(result.scalars().all())


@router.get("/series/{slug}/chapters/{chapter_slug}", response_model=ChapterDetailResponse)
async def get_chapter_detail(
    slug: str, chapter_slug: str, db: AsyncSession = Depends(get_db)
) -> ChapterDetailResponse:
    series_result = await db.execute(select(Series).where(Series.slug == slug))
    series = series_result.scalar_one_or_none()
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    chapter = await _get_chapter_by_slug(db, str(series.id), chapter_slug)
    if chapter is None or chapter.status != "published":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    pages = await _get_pages(db, str(chapter.id))
    return ChapterDetailResponse(
        id=str(chapter.id), series_id=str(chapter.series_id),
        chapter_number=float(chapter.chapter_number), title=chapter.title,
        slug=chapter.slug, status=chapter.status, page_count=chapter.page_count,
        created_at=chapter.created_at, updated_at=chapter.updated_at,
        pages=[
            PageResponse(
                id=str(p.id), chapter_id=str(p.chapter_id),
                page_number=p.page_number, image_path=p.image_path,
                width=p.width, height=p.height,
            )
            for p in pages
        ],
    )


@router.post("/series/{series_id}/chapters", response_model=ChapterResponse, status_code=status.HTTP_201_CREATED)
async def create_chapter(
    series_id: str,
    body: ChapterCreateRequest,
    _admin: dict = Depends(require_admin_or_service),
    db: AsyncSession = Depends(get_db),
) -> ChapterResponse:
    if await _get_series_by_id(db, series_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    chapter = Chapter(
        series_id=uuid.UUID(series_id),
        chapter_number=Decimal(str(body.chapter_number)),
        title=body.title, slug=body.slug, status=body.status, page_count=0,
    )
    db.add(chapter)
    await db.flush()
    await db.refresh(chapter)

    if chapter.status == "published":
        await notify_series_followers(
            db,
            series_id=chapter.series_id,
            chapter_id=chapter.id,
            chapter_number=chapter.chapter_number,
            chapter_title=chapter.title,
        )

    return ChapterResponse(
        id=str(chapter.id), series_id=str(chapter.series_id),
        chapter_number=float(chapter.chapter_number), title=chapter.title,
        slug=chapter.slug, status=chapter.status, page_count=chapter.page_count,
        created_at=chapter.created_at, updated_at=chapter.updated_at,
    )


@router.put("/series/{series_id}/chapters/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    series_id: str,
    chapter_id: str,
    body: ChapterUpdateRequest,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ChapterResponse:
    chapter = await _get_chapter_by_id(db, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    if body.chapter_number is not None:
        chapter.chapter_number = Decimal(str(body.chapter_number))
    if body.title is not None:
        chapter.title = body.title
    if body.slug is not None:
        chapter.slug = body.slug
    if body.status is not None:
        chapter.status = body.status
    await db.flush()
    await db.refresh(chapter)

    return ChapterResponse(
        id=str(chapter.id), series_id=str(chapter.series_id),
        chapter_number=float(chapter.chapter_number), title=chapter.title,
        slug=chapter.slug, status=chapter.status, page_count=chapter.page_count,
        created_at=chapter.created_at, updated_at=chapter.updated_at,
    )


@router.delete("/series/{series_id}/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(
    series_id: str,
    chapter_id: str,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    if await _get_series_by_id(db, series_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    result = await db.execute(
        delete(Chapter).where(
            Chapter.id == uuid.UUID(chapter_id),
            Chapter.series_id == uuid.UUID(series_id),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")


@router.post("/series/{series_id}/chapters/{chapter_id}/publish", response_model=ChapterResponse)
async def publish_chapter(
    series_id: str,
    chapter_id: str,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ChapterResponse:
    chapter = await _get_chapter_by_id(db, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")
    if chapter.series_id != uuid.UUID(series_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    was_published = chapter.status == "published"
    chapter.status = "published"
    await db.flush()

    # Publishing is idempotent: a retry must not send duplicate notifications.
    if not was_published:
        await notify_series_followers(
            db,
            series_id=chapter.series_id,
            chapter_id=chapter.id,
            chapter_number=chapter.chapter_number,
            chapter_title=chapter.title,
        )

    await db.refresh(chapter)
    return ChapterResponse(
        id=str(chapter.id), series_id=str(chapter.series_id),
        chapter_number=float(chapter.chapter_number), title=chapter.title,
        slug=chapter.slug, status=chapter.status, page_count=chapter.page_count,
        created_at=chapter.created_at, updated_at=chapter.updated_at,
    )


@router.post(
    "/series/{series_id}/chapters/{chapter_id}/pages",
    response_model=ChapterDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_pages_to_chapter(
    series_id: str,
    chapter_id: str,
    body: PagesCreateRequest,
    _admin: dict = Depends(require_admin_or_service),
    db: AsyncSession = Depends(get_db),
) -> ChapterDetailResponse:
    """Add page records to a chapter (used by scraper sync).

    Replaces all existing pages for the chapter with the provided list.
    Updates the chapter's page_count accordingly.
    """
    chapter = await _get_chapter_by_id(db, chapter_id)
    if chapter is None or chapter.series_id != uuid.UUID(series_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    from sqlalchemy import delete as sa_delete

    await db.execute(sa_delete(Page).where(Page.chapter_id == chapter.id))

    for p in body.pages:
        db.add(Page(
            chapter_id=chapter.id,
            page_number=p.page_number,
            image_path=p.image_path,
            width=p.width,
            height=p.height,
        ))

    chapter.page_count = len(body.pages)
    await db.flush()
    await db.refresh(chapter)

    pages = await _get_pages(db, str(chapter.id))
    return ChapterDetailResponse(
        id=str(chapter.id), series_id=str(chapter.series_id),
        chapter_number=float(chapter.chapter_number), title=chapter.title,
        slug=chapter.slug, status=chapter.status, page_count=chapter.page_count,
        created_at=chapter.created_at, updated_at=chapter.updated_at,
        pages=[
            PageResponse(
                id=str(p.id), chapter_id=str(p.chapter_id),
                page_number=p.page_number, image_path=p.image_path,
                width=p.width, height=p.height,
            )
            for p in pages
        ],
    )