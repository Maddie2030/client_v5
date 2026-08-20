import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from shared import get_db, require_user

router = APIRouter(tags=["notifications"])


class NotificationResponse(BaseModel):
    id: str
    series_id: str
    chapter_id: str
    message: str
    is_read: bool
    created_at: datetime
    series_title: str
    series_slug: str
    chapter_number: float
    chapter_slug: str


class NotificationCountResponse(BaseModel):
    unread: int


class MarkReadResponse(BaseModel):
    marked: bool


class MarkAllReadResponse(BaseModel):
    marked: int


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    unread_only: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationResponse]:
    unread_clause = "AND n.is_read = FALSE" if unread_only else ""
    sql = text(f"""
        SELECT n.id, n.series_id, n.chapter_id, n.message, n.is_read, n.created_at,
               s.title AS series_title, s.slug AS series_slug,
               c.chapter_number, c.slug AS chapter_slug
        FROM notifications n
        JOIN series s ON s.id = n.series_id
        JOIN chapters c ON c.id = n.chapter_id
        WHERE n.user_id = :user_id {unread_clause}
        ORDER BY n.created_at DESC LIMIT :limit OFFSET :offset
    """)
    result = await db.execute(sql, {
        "user_id": current_user["user_id"], "limit": limit, "offset": offset,
    })
    return [
        NotificationResponse(
            id=str(r["id"]), series_id=str(r["series_id"]),
            chapter_id=str(r["chapter_id"]), message=r["message"],
            is_read=r["is_read"], created_at=r["created_at"],
            series_title=r["series_title"], series_slug=r["series_slug"],
            chapter_number=float(r["chapter_number"]), chapter_slug=r["chapter_slug"],
        )
        for r in result.mappings().all()
    ]


@router.get("/count", response_model=NotificationCountResponse)
async def notification_count(
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationCountResponse:
    result = await db.execute(
        text("SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = :user_id AND is_read = FALSE"),
        {"user_id": current_user["user_id"]},
    )
    return NotificationCountResponse(unread=int(result.mappings().one()["cnt"]))


@router.post("/{notification_id}/read", response_model=MarkReadResponse)
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> MarkReadResponse:
    result = await db.execute(
        text("""
            UPDATE notifications SET is_read = TRUE
            WHERE id = :id AND user_id = :user_id
        """),
        {"id": notification_id, "user_id": current_user["user_id"]},
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    return MarkReadResponse(marked=True)


@router.post("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> MarkAllReadResponse:
    result = await db.execute(
        text("UPDATE notifications SET is_read = TRUE WHERE user_id = :user_id AND is_read = FALSE"),
        {"user_id": current_user["user_id"]},
    )
    return MarkAllReadResponse(marked=result.rowcount)
