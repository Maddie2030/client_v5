from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Bookmark, Notification, Subscription


async def notify_series_followers(
    db: AsyncSession,
    *,
    series_id,
    chapter_id,
    chapter_number,
    chapter_title: str | None,
) -> int:
    """Create one notification for every user following a series.

    Bookmarks and subscriptions are intentionally combined with UNION so a
    user who has both receives only one notification for the new chapter.
    """
    follower_query = union(
        select(Subscription.user_id).where(Subscription.series_id == series_id),
        select(Bookmark.user_id).where(Bookmark.series_id == series_id),
    )
    result = await db.execute(follower_query)
    follower_ids = result.scalars().all()

    if not follower_ids:
        return 0

    chapter_label = chapter_title or f"Chapter {chapter_number}"
    for user_id in follower_ids:
        db.add(
            Notification(
                user_id=user_id,
                series_id=series_id,
                chapter_id=chapter_id,
                message=f"New chapter: {chapter_label}",
                is_read=False,
            )
        )

    await db.flush()
    return len(follower_ids)