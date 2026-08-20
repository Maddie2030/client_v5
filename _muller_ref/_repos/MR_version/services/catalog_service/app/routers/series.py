import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared import get_db, get_current_user_optional, require_admin, Series, Genre, SeriesGenre

router = APIRouter()


# ── Schemas ──────────────────────────────────────

class SeriesCreateRequest(BaseModel):
    title: str
    slug: str
    description: str | None = None
    cover_image_path: str | None = None
    status: Literal["ongoing", "completed", "hiatus"] = "ongoing"
    genre_ids: list[int] = []

    @field_validator("slug")
    @classmethod
    def check_slug(cls, v: str) -> str:
        import re
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", v):
            raise ValueError("Slug must be lowercase kebab-case.")
        return v


class SeriesUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    cover_image_path: str | None = None
    status: Literal["ongoing", "completed", "hiatus"] | None = None
    genre_ids: list[int] | None = None


class SeriesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    slug: str
    description: str | None
    cover_image_path: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class GenreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


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


class SeriesDetailResponse(SeriesResponse):
    genres: list[GenreResponse] = []
    chapters: list[ChapterResponse] = []
    chapter_offset: int = 0
    chapter_limit: int = 20
    chapter_has_more: bool = False


# ── Helpers ──────────────────────────────────────

async def _get_series_by_slug(db: AsyncSession, slug: str) -> Series | None:
    result = await db.execute(select(Series).where(Series.slug == slug))
    return result.scalar_one_or_none()


async def _get_series_by_id(db: AsyncSession, series_id: str) -> Series | None:
    result = await db.execute(select(Series).where(Series.id == uuid.UUID(series_id)))
    return result.scalar_one_or_none()


async def _get_chapters_for_series(
    db: AsyncSession,
    series_id: str,
    published_only: bool = True,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list, bool]:
    from shared import Chapter
    stmt = select(Chapter).where(Chapter.series_id == uuid.UUID(series_id))
    if published_only:
        stmt = stmt.where(Chapter.status == "published")
    stmt = stmt.order_by(Chapter.chapter_number.desc(), Chapter.created_at.desc())
    stmt = stmt.offset(offset).limit(limit + 1)
    result = await db.execute(stmt)
    chapters = list(result.scalars().all())
    return chapters[:limit], len(chapters) > limit


async def _set_series_genres(db: AsyncSession, series_id: str, genre_ids: list[int]) -> None:
    sid = uuid.UUID(series_id)
    await db.execute(delete(SeriesGenre).where(SeriesGenre.series_id == sid))
    for gid in genre_ids:
        db.add(SeriesGenre(series_id=sid, genre_id=gid))
    await db.flush()


# ── Routes ───────────────────────────────────────

@router.get("/series", response_model=list[SeriesResponse])
async def list_series(
    search: str | None = Query(None),
    series_status: str | None = Query(None, alias="status"),
    genre: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[SeriesResponse]:
    if search:
        sql = text("""
            SELECT s.* FROM series s
            WHERE (
                s.title ILIKE '%' || :q || '%'
                OR s.title % :q
                OR s.description % :q
            )
              AND (CAST(:status AS TEXT) IS NULL OR s.status = CAST(:status AS TEXT))
            ORDER BY
              CASE WHEN s.title ILIKE :q || '%' THEN 0 ELSE 1 END,
              similarity(s.title, :q) DESC,
              s.updated_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await db.execute(sql, {
            "q": search, "status": series_status, "limit": limit, "offset": offset,
        })
        rows = result.mappings().all()
        series_ids = [str(r["id"]) for r in rows]
        if not series_ids:
            return []
        orm_result = await db.execute(
            select(Series).where(Series.id.in_([uuid.UUID(sid) for sid in series_ids]))
        )
        series_map = {str(s.id): s for s in orm_result.scalars().all()}
        return [
            SeriesResponse(
                id=str(s.id), title=s.title, slug=s.slug, description=s.description,
                cover_image_path=s.cover_image_path, status=s.status,
                created_at=s.created_at, updated_at=s.updated_at,
            )
            for sid in series_ids if (s := series_map.get(sid))
        ]

    stmt = select(Series)
    if series_status:
        stmt = stmt.where(Series.status == series_status)
    if genre is not None:
        stmt = stmt.join(SeriesGenre, SeriesGenre.series_id == Series.id).where(
            SeriesGenre.genre_id == genre
        )
    stmt = stmt.order_by(Series.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [
        SeriesResponse(
            id=str(s.id), title=s.title, slug=s.slug, description=s.description,
            cover_image_path=s.cover_image_path, status=s.status,
            created_at=s.created_at, updated_at=s.updated_at,
        )
        for s in result.scalars().all()
    ]


@router.get("/series/{slug}", response_model=SeriesDetailResponse)
async def get_series_detail(
    slug: str,
    current_user: dict | None = Depends(get_current_user_optional),
    chapter_offset: int = Query(0, ge=0),
    chapter_limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> SeriesDetailResponse:
    series = await _get_series_by_slug(db, slug)
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    is_admin = current_user and current_user.get("role") == "admin"
    chapters, chapter_has_more = await _get_chapters_for_series(
        db,
        str(series.id),
        published_only=not is_admin,
        offset=chapter_offset,
        limit=chapter_limit,
    )

    sg_result = await db.execute(
        select(Genre).join(SeriesGenre, SeriesGenre.genre_id == Genre.id).where(
            SeriesGenre.series_id == series.id
        )
    )
    genres = sg_result.scalars().all()

    return SeriesDetailResponse(
        id=str(series.id), title=series.title, slug=series.slug,
        description=series.description, cover_image_path=series.cover_image_path,
        status=series.status, created_at=series.created_at, updated_at=series.updated_at,
        genres=[GenreResponse(id=g.id, name=g.name) for g in genres],
        chapter_offset=chapter_offset,
        chapter_limit=chapter_limit,
        chapter_has_more=chapter_has_more,
        chapters=[
            ChapterResponse(
                id=str(c.id), series_id=str(c.series_id),
                chapter_number=float(c.chapter_number), title=c.title,
                slug=c.slug, status=c.status, page_count=c.page_count,
                created_at=c.created_at, updated_at=c.updated_at,
            )
            for c in chapters
        ],
    )


@router.get("/genres", response_model=list[GenreResponse])
async def list_genres(db: AsyncSession = Depends(get_db)) -> list[GenreResponse]:
    result = await db.execute(select(Genre).order_by(Genre.name))
    return [GenreResponse(id=g.id, name=g.name) for g in result.scalars().all()]


@router.post("/series", response_model=SeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_series(
    body: SeriesCreateRequest,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SeriesResponse:
    if await _get_series_by_slug(db, body.slug):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists.")

    series = Series(
        title=body.title, slug=body.slug, description=body.description,
        cover_image_path=body.cover_image_path, status=body.status,
    )
    db.add(series)
    await db.flush()
    await db.refresh(series)

    if body.genre_ids:
        await _set_series_genres(db, str(series.id), body.genre_ids)

    return SeriesResponse(
        id=str(series.id), title=series.title, slug=series.slug,
        description=series.description, cover_image_path=series.cover_image_path,
        status=series.status, created_at=series.created_at, updated_at=series.updated_at,
    )


@router.put("/series/{series_id}", response_model=SeriesResponse)
async def update_series(
    series_id: str,
    body: SeriesUpdateRequest,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SeriesResponse:
    series = await _get_series_by_id(db, series_id)
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    if body.title is not None:
        series.title = body.title
    if body.description is not None:
        series.description = body.description
    if body.cover_image_path is not None:
        series.cover_image_path = body.cover_image_path
    if body.status is not None:
        series.status = body.status
    await db.flush()
    await db.refresh(series)

    if body.genre_ids is not None:
        await _set_series_genres(db, series_id, body.genre_ids)

    return SeriesResponse(
        id=str(series.id), title=series.title, slug=series.slug,
        description=series.description, cover_image_path=series.cover_image_path,
        status=series.status, created_at=series.created_at, updated_at=series.updated_at,
    )


@router.delete("/series/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: str,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(delete(Series).where(Series.id == uuid.UUID(series_id)))
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")