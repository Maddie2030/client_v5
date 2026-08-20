import logging
import uuid
from datetime import datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from shared import (
    get_db, get_redis, get_current_user_optional, require_user,
    generate_image_token, Series, Chapter, Page, ReadingProgress, ReadingHistory,
)

router = APIRouter(tags=["reader"])
log = logging.getLogger(__name__)


class PageWithTokenResponse(BaseModel):
    page_number: int
    url: str
    width: int | None
    height: int | None


class ChapterReaderResponse(BaseModel):
    series: dict
    chapter: dict
    pages: list[PageWithTokenResponse]
    resume_scroll: int
    resume_page: int
    prev_chapter: dict | None
    next_chapter: dict | None


class ProgressSaveRequest(BaseModel):
    last_page: int = Field(ge=1)
    scroll_position: int = Field(ge=0)


class ProgressResponse(BaseModel):
    last_page: int
    scroll_position: int
    updated_at: datetime | None = None


class HistoryEntryResponse(BaseModel):
    series_title: str
    series_slug: str
    chapter_number: float
    chapter_title: str | None
    chapter_slug: str
    read_at: datetime


@router.get("/{series_slug}/{chapter_slug}", response_model=ChapterReaderResponse)
async def chapter_reader(
    series_slug: str,
    chapter_slug: str,
    current_user: dict | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> ChapterReaderResponse:
    series_result = await db.execute(select(Series).where(Series.slug == series_slug))
    series = series_result.scalar_one_or_none()
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    chapter_result = await db.execute(
        select(Chapter).where(
            Chapter.series_id == series.id, Chapter.slug == chapter_slug,
        )
    )
    chapter = chapter_result.scalar_one_or_none()
    is_admin = current_user and current_user.get("role") == "admin"
    if chapter is None or (chapter.status != "published" and not is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

    pages_result = await db.execute(
        select(Page).where(Page.chapter_id == chapter.id).order_by(Page.page_number)
    )
    pages = pages_result.scalars().all()

    user_id = current_user["user_id"] if current_user else None
    signed_pages = []
    for page in pages:
        token = await generate_image_token(redis, page.image_path, user_id)
        signed_pages.append(PageWithTokenResponse(
            page_number=page.page_number,
            url=f"/images/{page.image_path}?token={token}",
            width=page.width, height=page.height,
        ))

    resume_scroll = 0
    resume_page = 1
    if current_user:
        prog_result = await db.execute(
            select(ReadingProgress).where(
                ReadingProgress.user_id == uuid.UUID(user_id),
                ReadingProgress.chapter_id == chapter.id,
            )
        )
        progress = prog_result.scalar_one_or_none()
        if progress:
            resume_scroll = progress.scroll_position
            resume_page = progress.last_page

    if current_user:
        try:
            db.add(ReadingHistory(
                user_id=uuid.UUID(user_id), series_id=series.id, chapter_id=chapter.id,
            ))
            await db.flush()
        except Exception:
            log.warning("Failed to record history", exc_info=True)

    prev_result = await db.execute(
        select(Chapter).where(
            Chapter.series_id == series.id,
            Chapter.chapter_number < chapter.chapter_number,
            Chapter.status == "published",
        ).order_by(Chapter.chapter_number.desc()).limit(1)
    )
    prev_ch = prev_result.scalar_one_or_none()

    next_result = await db.execute(
        select(Chapter).where(
            Chapter.series_id == series.id,
            Chapter.chapter_number > chapter.chapter_number,
            Chapter.status == "published",
        ).order_by(Chapter.chapter_number.asc()).limit(1)
    )
    next_ch = next_result.scalar_one_or_none()

    def _nav(c: Chapter | None) -> dict | None:
        if c is None:
            return None
        return {
            "id": str(c.id), "slug": c.slug,
            "chapter_number": float(c.chapter_number), "title": c.title,
        }

    return ChapterReaderResponse(
        series={
            "id": str(series.id), "title": series.title,
            "slug": series.slug, "status": series.status,
        },
        chapter={
            "id": str(chapter.id), "slug": chapter.slug,
            "chapter_number": float(chapter.chapter_number),
            "title": chapter.title, "page_count": chapter.page_count,
        },
        pages=signed_pages,
        resume_scroll=resume_scroll, resume_page=resume_page,
        prev_chapter=_nav(prev_ch), next_chapter=_nav(next_ch),
    )


@router.post("/progress/{chapter_id}")
async def save_progress(
    chapter_id: str,
    body: ProgressSaveRequest,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    sql = text("""
        INSERT INTO reading_progress (user_id, chapter_id, last_page, scroll_position, updated_at)
        VALUES (:user_id, :chapter_id, :last_page, :scroll_position, NOW())
        ON CONFLICT (user_id, chapter_id)
        DO UPDATE SET last_page = EXCLUDED.last_page,
                      scroll_position = EXCLUDED.scroll_position,
                      updated_at = NOW()
    """)
    await db.execute(sql, {
        "user_id": current_user["user_id"], "chapter_id": chapter_id,
        "last_page": body.last_page, "scroll_position": body.scroll_position,
    })
    return {"saved": True}


@router.get("/progress/{chapter_id}", response_model=ProgressResponse)
async def get_progress(
    chapter_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressResponse:
    result = await db.execute(
        select(ReadingProgress).where(
            ReadingProgress.user_id == uuid.UUID(current_user["user_id"]),
            ReadingProgress.chapter_id == uuid.UUID(chapter_id),
        )
    )
    progress = result.scalar_one_or_none()
    if progress is None:
        return ProgressResponse(last_page=1, scroll_position=0, updated_at=None)
    return ProgressResponse(
        last_page=progress.last_page,
        scroll_position=progress.scroll_position,
        updated_at=progress.updated_at,
    )


@router.get("/history", response_model=list[HistoryEntryResponse])
async def reading_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[HistoryEntryResponse]:
    sql = text("""
        SELECT rh.read_at, s.title AS series_title, s.slug AS series_slug,
               c.chapter_number, c.title AS chapter_title, c.slug AS chapter_slug
        FROM reading_history rh
        JOIN series s ON s.id = rh.series_id
        JOIN chapters c ON c.id = rh.chapter_id
        WHERE rh.user_id = :user_id
        ORDER BY rh.read_at DESC LIMIT :limit OFFSET :offset
    """)
    result = await db.execute(sql, {
        "user_id": current_user["user_id"], "limit": limit, "offset": offset,
    })
    return [
        HistoryEntryResponse(
            series_title=r["series_title"], series_slug=r["series_slug"],
            chapter_number=float(r["chapter_number"]),
            chapter_title=r["chapter_title"], chapter_slug=r["chapter_slug"],
            read_at=r["read_at"],
        )
        for r in result.mappings().all()
    ]
