import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from shared import Chapter, Comment, Series, get_db, require_user

router = APIRouter(prefix="/comments", tags=["comments"])


class CommentCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    series_id: str | None = None
    chapter_id: str | None = None
    parent_id: str | None = None


class CommentResponse(BaseModel):
    id: str
    user_id: str
    author_username: str
    series_id: str
    chapter_id: str | None
    parent_id: str | None
    content: str
    created_at: datetime
    updated_at: datetime


def _parse_uuid(value: str, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Invalid {field_name}."
        ) from None


def _comment_response(row) -> CommentResponse:
    return CommentResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        author_username=row["author_username"],
        series_id=str(row["series_id"]),
        chapter_id=str(row["chapter_id"]) if row["chapter_id"] else None,
        parent_id=str(row["parent_id"]) if row["parent_id"] else None,
        content=row["content"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    series_id: str | None = Query(None, alias="seriesId"),
    chapter_id: str | None = Query(None, alias="chapterId"),
    db: AsyncSession = Depends(get_db),
) -> list[CommentResponse]:
    if not series_id and not chapter_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provide a seriesId or chapterId to load comments.",
        )

    series_uuid = _parse_uuid(series_id, "seriesId") if series_id else None
    chapter_uuid = _parse_uuid(chapter_id, "chapterId") if chapter_id else None

    sql = text("""
        SELECT c.id, c.user_id, u.username AS author_username,
               c.series_id, c.chapter_id, c.parent_id, c.content,
               c.created_at, c.updated_at
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE (:series_id IS NULL OR c.series_id = :series_id)
          AND (:chapter_id IS NULL OR c.chapter_id = :chapter_id)
        ORDER BY c.created_at ASC
    """)
    result = await db.execute(sql, {
        "series_id": series_uuid,
        "chapter_id": chapter_uuid,
    })
    return [_comment_response(row) for row in result.mappings().all()]


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    body: CommentCreateRequest,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    content = body.content.strip()
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment cannot be empty.")

    if not body.series_id and not body.chapter_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provide a series_id or chapter_id for the comment.",
        )

    series_uuid = _parse_uuid(body.series_id, "series_id") if body.series_id else None
    chapter_uuid = _parse_uuid(body.chapter_id, "chapter_id") if body.chapter_id else None

    chapter = None
    if chapter_uuid:
        chapter = await db.scalar(select(Chapter).where(Chapter.id == chapter_uuid))
        if chapter is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")
        if series_uuid and chapter.series_id != series_uuid:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Chapter does not belong to the selected series.",
            )
        series_uuid = chapter.series_id
    elif await db.scalar(select(Series.id).where(Series.id == series_uuid)) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found.")

    parent_uuid = _parse_uuid(body.parent_id, "parent_id") if body.parent_id else None
    if parent_uuid:
        parent = await db.scalar(select(Comment).where(Comment.id == parent_uuid))
        if parent is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent comment not found.")
        if parent.series_id != series_uuid or parent.chapter_id != chapter_uuid:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Reply must belong to the same discussion.",
            )
        if parent.parent_id is not None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Replies can only be one level deep.",
            )

    comment = Comment(
        user_id=uuid.UUID(current_user["user_id"]),
        series_id=series_uuid,
        chapter_id=chapter_uuid,
        parent_id=parent_uuid,
        content=content,
    )
    db.add(comment)
    await db.flush()

    row = await db.execute(
        text("""
            SELECT c.id, c.user_id, u.username AS author_username,
                   c.series_id, c.chapter_id, c.parent_id, c.content,
                   c.created_at, c.updated_at
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = :comment_id
        """),
        {"comment_id": comment.id},
    )
    return _comment_response(row.mappings().one())


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: str,
    current_user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    comment_uuid = _parse_uuid(comment_id, "comment_id")
    result = await db.execute(
        delete(Comment).where(
            Comment.id == comment_uuid,
            Comment.user_id == uuid.UUID(current_user["user_id"]),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")