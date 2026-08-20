import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from shared import get_db, require_user, Series, Bookmark, Subscription

router = APIRouter(tags=["social"])


class BookmarkResponse(BaseModel):
    id: str
    series_id: str
    series_title: str
    series_slug: str
    series_cover: str | None
    series_status: str
    created_at: datetime


class SubscriptionResponse(BaseModel):
    id: str
    series_id: str
    series_title: str
    series_slug: str
    series_cover: str | None
    series_status: str
    unread_count: int
    created_at: datetime


class BookmarkStatusResponse(BaseModel):
    bookmarked: bool


class SubscriptionStatusResponse(BaseModel):
    subscribed: bool


async def _get_series_by_id(db: AsyncSession, series_id: str) -> Series | None:
    result = await db.execute(select(Series).where(Series.id == uuid.UUID(series_id)))
    return result.scalar_one_or_none()


# ── Bookmarks ───────────────────────────────────

@router.post("/bookmarks/{series_id}")
async def add_bookmark(
    series_id: str,
    response: Response,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkResponse:
    series = await _get_series_by_id(db, series_id)
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    existing_result = await db.execute(
        select(Bookmark).where(
            Bookmark.user_id == uuid.UUID(current_user["user_id"]),
            Bookmark.series_id == uuid.UUID(series_id),
        )
    )
    already = existing_result.scalar_one_or_none() is not None
    if not already:
        bookmark = Bookmark(
            user_id=uuid.UUID(current_user["user_id"]),
            series_id=uuid.UUID(series_id),
        )
        db.add(bookmark)
        await db.flush()
        await db.refresh(bookmark)
    else:
        bookmark = existing_result.scalar_one()

    response.status_code = status.HTTP_200_OK if already else status.HTTP_201_CREATED
    return BookmarkResponse(
        id=str(bookmark.id), series_id=str(series.id),
        series_title=series.title, series_slug=series.slug,
        series_cover=series.cover_image_path, series_status=series.status,
        created_at=bookmark.created_at,
    )


@router.delete("/bookmarks/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_bookmark(
    series_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        delete(Bookmark).where(
            Bookmark.user_id == uuid.UUID(current_user["user_id"]),
            Bookmark.series_id == uuid.UUID(series_id),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bookmark not found.")


@router.get("/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[BookmarkResponse]:
    sql = text("""
        SELECT b.id, b.series_id, b.created_at, s.title AS series_title,
               s.slug AS series_slug, s.cover_image_path AS series_cover,
               s.status AS series_status
        FROM bookmarks b JOIN series s ON s.id = b.series_id
        WHERE b.user_id = :user_id ORDER BY b.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    result = await db.execute(sql, {
        "user_id": current_user["user_id"], "limit": limit, "offset": offset,
    })
    return [
        BookmarkResponse(
            id=str(r["id"]), series_id=str(r["series_id"]),
            series_title=r["series_title"], series_slug=r["series_slug"],
            series_cover=r["series_cover"], series_status=r["series_status"],
            created_at=r["created_at"],
        )
        for r in result.mappings().all()
    ]


@router.get("/bookmarks/{series_id}/status", response_model=BookmarkStatusResponse)
async def bookmark_status(
    series_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkStatusResponse:
    result = await db.execute(
        select(Bookmark).where(
            Bookmark.user_id == uuid.UUID(current_user["user_id"]),
            Bookmark.series_id == uuid.UUID(series_id),
        )
    )
    return BookmarkStatusResponse(bookmarked=result.scalar_one_or_none() is not None)


# ── Subscriptions ───────────────────────────────

@router.post("/subscriptions/{series_id}")
async def subscribe(
    series_id: str,
    response: Response,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    series = await _get_series_by_id(db, series_id)
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    existing_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == uuid.UUID(current_user["user_id"]),
            Subscription.series_id == uuid.UUID(series_id),
        )
    )
    already = existing_result.scalar_one_or_none()
    if already is None:
        sub = Subscription(
            user_id=uuid.UUID(current_user["user_id"]),
            series_id=uuid.UUID(series_id),
        )
        db.add(sub)
        await db.flush()
        await db.refresh(sub)
    else:
        sub = already

    response.status_code = status.HTTP_200_OK if already else status.HTTP_201_CREATED
    return SubscriptionResponse(
        id=str(sub.id), series_id=str(series.id),
        series_title=series.title, series_slug=series.slug,
        series_cover=series.cover_image_path, series_status=series.status,
        unread_count=0, created_at=sub.created_at,
    )


@router.delete("/subscriptions/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    series_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        delete(Subscription).where(
            Subscription.user_id == uuid.UUID(current_user["user_id"]),
            Subscription.series_id == uuid.UUID(series_id),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")


@router.get("/subscriptions", response_model=list[SubscriptionResponse])
async def list_subscriptions(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[SubscriptionResponse]:
    sql = text("""
        SELECT sub.id, sub.series_id, sub.created_at, s.title AS series_title,
               s.slug AS series_slug, s.cover_image_path AS series_cover,
               s.status AS series_status,
               (SELECT COUNT(*) FROM notifications n
                WHERE n.user_id = :user_id AND n.series_id = sub.series_id
                  AND n.is_read = FALSE) AS unread_count
        FROM subscriptions sub JOIN series s ON s.id = sub.series_id
        WHERE sub.user_id = :user_id ORDER BY sub.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    result = await db.execute(sql, {
        "user_id": current_user["user_id"], "limit": limit, "offset": offset,
    })
    return [
        SubscriptionResponse(
            id=str(r["id"]), series_id=str(r["series_id"]),
            series_title=r["series_title"], series_slug=r["series_slug"],
            series_cover=r["series_cover"], series_status=r["series_status"],
            unread_count=int(r["unread_count"]), created_at=r["created_at"],
        )
        for r in result.mappings().all()
    ]


@router.get("/subscriptions/{series_id}/status", response_model=SubscriptionStatusResponse)
async def subscription_status(
    series_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionStatusResponse:
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == uuid.UUID(current_user["user_id"]),
            Subscription.series_id == uuid.UUID(series_id),
        )
    )
    return SubscriptionStatusResponse(subscribed=result.scalar_one_or_none() is not None)
