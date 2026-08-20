import { getDb } from '@/lib/database';
import { getImageURL, storeImage, fetchAndStoreImage, deleteImagesByPrefix } from '@/lib/imageStore';
import { slugify, generateUniqueKey } from '@/lib/scraper';
import type {
  Series, SeriesWithGenres, SeriesStatus, Genre, Chapter, ChapterWithPages, Page,
  Comment, Notification, Bookmark, Subscription, ReadingProgress, ReadingHistory,
  ScrapeRecord, ScrapeRecordSummary, ScrapeMode, ScrapeResult,
  ImageItem, EditableTextField, User,
} from '@/types';

// ─── Series ──────────────────────────────────────

export async function listSeries(opts: {
  search?: string; status?: string; genre?: number; offset?: number; limit?: number;
} = {}): Promise<SeriesWithGenres[]> {
  const db = await getDb();
  const { search, status, genre, offset = 0, limit = 20 } = opts;
  let sql = `SELECT s.* FROM series s`;
  const params: unknown[] = [];
  let idx = 1;
  let where = '';
  if (genre !== undefined) {
    sql += ` JOIN series_genres sg ON sg.series_id = s.id`;
    where += `${where ? ' AND ' : ' WHERE '}sg.genre_id = $${idx++}`;
    params.push(genre);
  }
  if (status) {
    where += `${where ? ' AND ' : ' WHERE '}s.status = $${idx++}`;
    params.push(status);
  }
  if (search) {
    where += `${where ? ' AND ' : ' WHERE '}(s.title ILIKE '%' || $${idx} || '%' OR s.description ILIKE '%' || $${idx} || '%')`;
    params.push(search);
    idx++;
  }
  sql += where + ` ORDER BY s.updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);
  const result = await db.query(sql, params);
  const seriesList = result.rows as Series[];
  return Promise.all(seriesList.map(async (s) => {
    const genres = await getGenresForSeries(s.id);
    const chResult = await db.query('SELECT COUNT(*) as cnt FROM chapters WHERE series_id = $1', [s.id]);
    return { ...s, genres, chapter_count: (chResult.rows[0] as Record<string, unknown>).cnt as number };
  }));
}

export async function getSeriesBySlug(slug: string): Promise<SeriesWithGenres | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM series WHERE slug = $1', [slug]);
  if (result.rows.length === 0) return null;
  const s = result.rows[0] as Series;
  const genres = await getGenresForSeries(s.id);
  const chResult = await db.query('SELECT COUNT(*) as cnt FROM chapters WHERE series_id = $1', [s.id]);
  return { ...s, genres, chapter_count: (chResult.rows[0] as Record<string, unknown>).cnt as number };
}

export async function getSeriesById(id: string): Promise<Series | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM series WHERE id = $1', [id]);
  return (result.rows[0] as Series) ?? null;
}

export async function createSeries(data: {
  title: string; slug: string; description?: string; cover_image_path?: string;
  status?: string; genre_ids?: number[];
}): Promise<Series> {
  const db = await getDb();
  let slug = data.slug || slugify(data.title);
  let suffix = 1;
  let existing = await db.query('SELECT 1 FROM series WHERE slug = $1', [slug]);
  while (existing.rows.length > 0) {
    slug = `${data.slug || slugify(data.title)}-${suffix++}`;
    existing = await db.query('SELECT 1 FROM series WHERE slug = $1', [slug]);
  }
  const result = await db.query(
    `INSERT INTO series (id, title, slug, description, cover_image_path, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [crypto.randomUUID(), data.title, slug, data.description ?? null, data.cover_image_path ?? null, data.status ?? 'ongoing'],
  );
  const series = result.rows[0] as Series;
  if (data.genre_ids?.length) await setSeriesGenres(series.id, data.genre_ids);
  return series;
}

export async function updateSeries(id: string, data: {
  title?: string; description?: string; cover_image_path?: string; status?: string; genre_ids?: number[];
}): Promise<Series | null> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (data.title !== undefined) { updates.push(`title = $${idx++}`); params.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); params.push(data.description); }
  if (data.cover_image_path !== undefined) { updates.push(`cover_image_path = $${idx++}`); params.push(data.cover_image_path); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); params.push(data.status); }
  updates.push('updated_at = NOW()');
  params.push(id);
  const result = await db.query(`UPDATE series SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  const series = (result.rows[0] as Series) ?? null;
  if (series && data.genre_ids !== undefined) await setSeriesGenres(series.id, data.genre_ids);
  return series;
}

export async function deleteSeries(id: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM series WHERE id = $1', [id]);
  await deleteImagesByPrefix(`series/${id}/`);
}

async function getGenresForSeries(seriesId: string): Promise<Genre[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT g.* FROM genres g JOIN series_genres sg ON sg.genre_id = g.id WHERE sg.series_id = $1 ORDER BY g.name`,
    [seriesId],
  );
  return result.rows as Genre[];
}

async function setSeriesGenres(seriesId: string, genreIds: number[]): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM series_genres WHERE series_id = $1', [seriesId]);
  for (const gid of genreIds) {
    await db.query('INSERT INTO series_genres (series_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [seriesId, gid]);
  }
}

export async function listGenres(): Promise<Genre[]> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM genres ORDER BY name');
  return result.rows as Genre[];
}

// ─── Chapters & Pages ─────────────────────────────────

export async function listChapters(seriesId: string, publishedOnly = true): Promise<Chapter[]> {
  const db = await getDb();
  let sql = 'SELECT * FROM chapters WHERE series_id = $1';
  if (publishedOnly) sql += " AND status = 'published'";
  sql += ' ORDER BY chapter_number DESC, created_at DESC';
  const result = await db.query(sql, [seriesId]);
  return result.rows as Chapter[];
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM chapters WHERE id = $1', [id]);
  return (result.rows[0] as Chapter) ?? null;
}

export async function getChapterWithPages(seriesSlug: string, chapterSlug: string): Promise<ChapterWithPages | null> {
  const db = await getDb();
  const seriesResult = await db.query('SELECT id FROM series WHERE slug = $1', [seriesSlug]);
  if (seriesResult.rows.length === 0) return null;
  const seriesId = (seriesResult.rows[0] as Record<string, string>).id;
  const chResult = await db.query('SELECT * FROM chapters WHERE series_id = $1 AND slug = $2', [seriesId, chapterSlug]);
  if (chResult.rows.length === 0) return null;
  const chapter = chResult.rows[0] as Chapter;
  const pagesResult = await db.query('SELECT * FROM pages WHERE chapter_id = $1 ORDER BY page_number', [chapter.id]);
  return { ...chapter, pages: pagesResult.rows as Page[] };
}

export async function createChapter(seriesId: string, data: {
  chapter_number: number; title?: string; slug: string; status?: string;
}): Promise<Chapter> {
  const db = await getDb();
  let slug = data.slug || slugify(`chapter-${data.chapter_number}`);
  let chapterNum = data.chapter_number;
  let suffix = 1;

  // Deduplicate both slug and chapter_number to avoid UNIQUE constraint violations
  let existingSlug = await db.query('SELECT 1 FROM chapters WHERE series_id = $1 AND slug = $2', [seriesId, slug]);
  let existingNum = await db.query('SELECT 1 FROM chapters WHERE series_id = $1 AND chapter_number = $2', [seriesId, chapterNum]);
  while (existingSlug.rows.length > 0 || existingNum.rows.length > 0) {
    slug = `${data.slug || slugify(`chapter-${data.chapter_number}`)}-${suffix}`;
    chapterNum = data.chapter_number + suffix * 0.01;
    suffix++;
    existingSlug = await db.query('SELECT 1 FROM chapters WHERE series_id = $1 AND slug = $2', [seriesId, slug]);
    existingNum = await db.query('SELECT 1 FROM chapters WHERE series_id = $1 AND chapter_number = $2', [seriesId, chapterNum]);
  }

  const result = await db.query(
    `INSERT INTO chapters (id, series_id, chapter_number, title, slug, status, page_count)
     VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
    [crypto.randomUUID(), seriesId, chapterNum, data.title ?? null, slug, data.status ?? 'draft'],
  );
  return result.rows[0] as Chapter;
}

export async function updateChapter(id: string, data: {
  chapter_number?: number; title?: string; slug?: string; status?: string;
}): Promise<Chapter | null> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (data.chapter_number !== undefined) { updates.push(`chapter_number = $${idx++}`); params.push(data.chapter_number); }
  if (data.title !== undefined) { updates.push(`title = $${idx++}`); params.push(data.title); }
  if (data.slug !== undefined) { updates.push(`slug = $${idx++}`); params.push(data.slug); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); params.push(data.status); }
  updates.push('updated_at = NOW()');
  params.push(id);
  const result = await db.query(`UPDATE chapters SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  return (result.rows[0] as Chapter) ?? null;
}

export async function deleteChapter(id: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM chapters WHERE id = $1', [id]);
  await deleteImagesByPrefix(`chapter/${id}/`);
}

export async function publishChapter(id: string): Promise<Chapter | null> {
  return updateChapter(id, { status: 'published' });
}

export async function setChapterPages(chapterId: string, pages: Array<{
  page_number: number; image_path: string; width?: number; height?: number;
}>): Promise<ChapterWithPages | null> {
  const db = await getDb();
  const chapter = await getChapterById(chapterId);
  if (!chapter) return null;
  await db.query('DELETE FROM pages WHERE chapter_id = $1', [chapterId]);
  for (const p of pages) {
    await db.query(
      `INSERT INTO pages (id, chapter_id, page_number, image_path, width, height)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (chapter_id, page_number) DO UPDATE SET image_path = EXCLUDED.image_path`,
      [crypto.randomUUID(), chapterId, p.page_number, p.image_path, p.width ?? null, p.height ?? null],
    );
  }
  await db.query('UPDATE chapters SET page_count = $1, updated_at = NOW() WHERE id = $2', [pages.length, chapterId]);
  const result = await db.query('SELECT * FROM pages WHERE chapter_id = $1 ORDER BY page_number', [chapterId]);
  return { ...chapter, page_count: pages.length, pages: result.rows as Page[] };
}

export async function getPageImageURL(imagePath: string): Promise<string | null> {
  return getImageURL(imagePath);
}

// ─── Reading Progress & History ────────────────────────

export async function saveReadingProgress(userId: string, chapterId: string, lastPage: number, scrollPosition: number): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO reading_progress (id, user_id, chapter_id, last_page, scroll_position, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, chapter_id) DO UPDATE SET last_page = EXCLUDED.last_page, scroll_position = EXCLUDED.scroll_position, updated_at = NOW()`,
    [crypto.randomUUID(), userId, chapterId, lastPage, scrollPosition],
  );
}

export async function getReadingProgress(userId: string, chapterId: string): Promise<ReadingProgress | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM reading_progress WHERE user_id = $1 AND chapter_id = $2', [userId, chapterId]);
  return (result.rows[0] as ReadingProgress) ?? null;
}

export async function addReadingHistory(userId: string, seriesId: string, chapterId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO reading_history (id, user_id, series_id, chapter_id, read_at) VALUES ($1, $2, $3, $4, NOW())`,
    [crypto.randomUUID(), userId, seriesId, chapterId],
  );
}

export async function getReadingHistory(userId: string, limit = 20): Promise<Array<ReadingHistory & { series_title: string; series_slug: string; chapter_number: number }>> {
  const db = await getDb();
  const result = await db.query(
    `SELECT rh.*, s.title as series_title, s.slug as series_slug, c.chapter_number
     FROM reading_history rh
     JOIN series s ON s.id = rh.series_id
     JOIN chapters c ON c.id = rh.chapter_id
     WHERE rh.user_id = $1
     ORDER BY rh.read_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows as Array<ReadingHistory & { series_title: string; series_slug: string; chapter_number: number }>;
}

// ─── Bookmarks & Subscriptions ─────────────────────────

export async function toggleBookmark(userId: string, seriesId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.query('SELECT id FROM bookmarks WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
  if (existing.rows.length > 0) {
    await db.query('DELETE FROM bookmarks WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
    return false;
  }
  await db.query('INSERT INTO bookmarks (id, user_id, series_id) VALUES ($1, $2, $3)', [crypto.randomUUID(), userId, seriesId]);
  return true;
}

export async function isBookmarked(userId: string, seriesId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.query('SELECT id FROM bookmarks WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
  return result.rows.length > 0;
}

export async function getBookmarks(userId: string): Promise<Array<Bookmark & { series: Series }>> {
  const db = await getDb();
  const result = await db.query(
    `SELECT b.*, s.title, s.slug, s.cover_image_path, s.status, s.description, s.created_at as s_created_at, s.updated_at as s_updated_at
     FROM bookmarks b JOIN series s ON s.id = b.series_id WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
  return result.rows.map((r) => {
    const row = r as Record<string, string>;
    return {
      id: row.id, user_id: row.user_id, series_id: row.series_id, created_at: row.created_at,
      series: { id: row.series_id, title: row.title, slug: row.slug, cover_image_path: row.cover_image_path, status: row.status as SeriesStatus, description: row.description, created_at: row.s_created_at, updated_at: row.s_updated_at },
    };
  });
}

export async function toggleSubscription(userId: string, seriesId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
  if (existing.rows.length > 0) {
    await db.query('DELETE FROM subscriptions WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
    return false;
  }
  await db.query('INSERT INTO subscriptions (id, user_id, series_id) VALUES ($1, $2, $3)', [crypto.randomUUID(), userId, seriesId]);
  return true;
}

export async function isSubscribed(userId: string, seriesId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.query('SELECT id FROM subscriptions WHERE user_id = $1 AND series_id = $2', [userId, seriesId]);
  return result.rows.length > 0;
}

// ─── Notifications ─────────────────────────────────────

export async function getNotifications(userId: string): Promise<Notification[]> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const db = await getDb();
  await db.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = await getDb();
  await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [userId]);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.query('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false', [userId]);
  return (result.rows[0] as Record<string, unknown>).cnt as number;
}

export async function notifySeriesFollowers(seriesId: string, chapterId: string, message: string): Promise<void> {
  const db = await getDb();
  const subs = await db.query('SELECT user_id FROM subscriptions WHERE series_id = $1', [seriesId]);
  for (const row of subs.rows) {
    await db.query(
      'INSERT INTO notifications (id, user_id, series_id, chapter_id, message) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), (row as Record<string, string>).user_id, seriesId, chapterId, message],
    );
  }
}

// ─── Comments ──────────────────────────────────────────

export async function getComments(seriesId: string, chapterId: string | null): Promise<Comment[]> {
  const db = await getDb();
  let sql = `SELECT c.*, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE c.series_id = $1`;
  const params: unknown[] = [seriesId];
  if (chapterId) {
    sql += ` AND c.chapter_id = $2`;
    params.push(chapterId);
  } else {
    sql += ` AND c.chapter_id IS NULL`;
  }
  sql += ` ORDER BY c.created_at ASC`;
  const result = await db.query(sql, params);
  const allComments = result.rows as Comment[];
  const buildTree = (parentId: string | null): Comment[] =>
    allComments
      .filter((c) => c.parent_id === parentId)
      .map((c) => ({ ...c, children: buildTree(c.id) }));
  return buildTree(null);
}

export async function createComment(userId: string, seriesId: string, content: string, chapterId?: string, parentId?: string): Promise<Comment> {
  const db = await getDb();
  const result = await db.query(
    `INSERT INTO comments (id, user_id, series_id, chapter_id, parent_id, content)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [crypto.randomUUID(), userId, seriesId, chapterId ?? null, parentId ?? null, content.trim()],
  );
  const comment = result.rows[0] as Comment;
  const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
  comment.username = (userResult.rows[0] as Record<string, string>).username;
  return comment;
}

export async function deleteComment(id: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM comments WHERE id = $1', [id]);
}

// ─── Scrape Records ────────────────────────────────────

export async function saveScrapeRecord(data: ScrapeResult & {
  parentId?: string | null; editedText?: EditableTextField[]; editedImages?: ImageItem[];
}): Promise<ScrapeRecord> {
  const db = await getDb();
  let position: number | null = null;
  let uniqueKey: string | null = null;

  if (data.parentId) {
    const maxResult = await db.query(
      'SELECT COALESCE(MAX(position), 0) as max_pos FROM scrape_records WHERE parent_id = $1', [data.parentId],
    );
    position = ((maxResult.rows[0] as Record<string, number>).max_pos ?? 0) + 1;
    uniqueKey = generateUniqueKey(data.parentId, '');
  }

  const result = await db.query(
    `INSERT INTO scrape_records (id, url, mode, title, summary, status, result, error, parent_id, position, unique_key, edited_text, edited_images, saved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true) RETURNING *`,
    [
      crypto.randomUUID(), data.url, data.mode, data.title, data.summary, data.status,
      JSON.stringify(data.result), data.error ?? null,
      data.parentId ?? null,
      position,
      uniqueKey,
      data.editedText ? JSON.stringify(data.editedText) : null,
      data.editedImages ? JSON.stringify(data.editedImages) : null,
    ],
  );
  return result.rows[0] as ScrapeRecord;
}

export async function attachScrapeChild(childId: string, parentId: string): Promise<{ position: number; unique_key: string }> {
  const db = await getDb();
  const maxResult = await db.query(
    'SELECT COALESCE(MAX(position), 0) as max_pos FROM scrape_records WHERE parent_id = $1', [parentId],
  );
  const nextPos = ((maxResult.rows[0] as Record<string, number>).max_pos ?? 0) + 1;
  const uniqueKey = generateUniqueKey(parentId, childId);
  await db.query(
    'UPDATE scrape_records SET parent_id = $1, position = $2, unique_key = $3, updated_at = NOW() WHERE id = $4',
    [parentId, nextPos, uniqueKey, childId],
  );
  return { position: nextPos, unique_key: uniqueKey };
}

export async function reorderScrapeChildren(parentId: string, childIds: string[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < childIds.length; i++) {
    await db.query('UPDATE scrape_records SET position = $1, updated_at = NOW() WHERE id = $2', [i + 1, childIds[i]]);
  }
}

export async function editScrapeRecord(id: string, data: { editedText?: EditableTextField[]; editedImages?: ImageItem[] }): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (data.editedText !== undefined) { updates.push(`edited_text = $${idx++}`); params.push(JSON.stringify(data.editedText)); }
  if (data.editedImages !== undefined) { updates.push(`edited_images = $${idx++}`); params.push(JSON.stringify(data.editedImages)); }
  if (updates.length === 0) return;
  updates.push('updated_at = NOW()');
  params.push(id);
  await db.query(`UPDATE scrape_records SET ${updates.join(', ')} WHERE id = $${idx}`, params);
}

export async function getScrapeChildren(parentId: string): Promise<ScrapeRecordSummary[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT id, url, mode, title, summary, status, parent_id, position, unique_key, saved, synced, created_at
     FROM scrape_records WHERE parent_id = $1 ORDER BY position ASC, created_at ASC`,
    [parentId],
  );
  return result.rows as ScrapeRecordSummary[];
}

export async function getScrapeRecord(id: string): Promise<ScrapeRecord | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM scrape_records WHERE id = $1', [id]);
  return (result.rows[0] as ScrapeRecord) ?? null;
}

export async function listScrapeRecords(opts: {
  limit?: number; mode?: ScrapeMode; parentsOnly?: boolean;
} = {}): Promise<ScrapeRecordSummary[]> {
  const db = await getDb();
  const { limit = 50, mode, parentsOnly } = opts;
  let sql = `SELECT id, url, mode, title, summary, status, parent_id, position, unique_key, saved, synced, created_at
     FROM scrape_records WHERE saved = true`;
  const params: unknown[] = [];
  let idx = 1;
  if (mode) { sql += ` AND mode = $${idx++}`; params.push(mode); }
  if (parentsOnly) { sql += ` AND parent_id IS NULL`; }
  sql += ` ORDER BY created_at DESC LIMIT $${idx++}`;
  params.push(limit);
  const result = await db.query(sql, params);
  return result.rows as ScrapeRecordSummary[];
}

export async function listOrphanScrapeRecords(): Promise<ScrapeRecordSummary[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT id, url, mode, title, summary, status, parent_id, position, unique_key, saved, synced, created_at
     FROM scrape_records WHERE saved = true AND parent_id IS NULL ORDER BY created_at DESC`,
  );
  return result.rows as ScrapeRecordSummary[];
}

export async function deleteScrapeRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM scrape_records WHERE id = $1 OR parent_id = $1', [id]);
}

export async function clearScrapeHistory(): Promise<void> {
  const db = await getDb();
  await db.query('DELETE FROM scrape_records WHERE saved = true');
}

// ─── Sync Scrape → Catalog ─────────────────────────────

export async function syncScrapeParentToSeries(parentId: string): Promise<Series | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM scrape_records WHERE id = $1', [parentId]);
  if (result.rows.length === 0) return null;
  const record = result.rows[0] as ScrapeRecord;
  const title = record.title || record.url;
  const slug = slugify(title);
  const resultData = record.result as Record<string, unknown> | null;
  const description = (resultData?.metadata as Record<string, unknown>)?.description as string ?? record.summary ?? null;
  const coverPath = (resultData?.metadata as Record<string, unknown>)?.ogImage as string ?? null;

  let series: Series | null = await getSeriesBySlug(slug);
  if (!series) {
    series = await createSeries({ title, slug, description: description ?? undefined, cover_image_path: coverPath ?? undefined, status: 'ongoing' });
  } else {
    series = await updateSeries(series.id, { description: description ?? undefined, cover_image_path: coverPath ?? undefined });
  }
  await db.query('UPDATE scrape_records SET synced = true, updated_at = NOW() WHERE id = $1', [parentId]);
  return series;
}

export async function syncScrapeChildToChapter(childId: string, seriesId?: string): Promise<Chapter | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM scrape_records WHERE id = $1', [childId]);
  if (result.rows.length === 0) return null;
  const child = result.rows[0] as ScrapeRecord;
  let targetSeriesId = seriesId;
  if (!targetSeriesId && child.parent_id) {
    const parentResult = await db.query('SELECT * FROM scrape_records WHERE id = $1', [child.parent_id]);
    if (parentResult.rows.length > 0) {
      const parent = parentResult.rows[0] as ScrapeRecord;
      const parentTitle = parent.title || parent.url;
      const parentSlug = slugify(parentTitle);
      const existingSeries = await getSeriesBySlug(parentSlug);
      if (existingSeries) targetSeriesId = existingSeries.id;
    }
  }
  if (!targetSeriesId) return null;

  const chapterNum = (child.position ?? 1);
  const chapterSlug = slugify(`chapter-${chapterNum}`);
  let chapter = await createChapter(targetSeriesId, {
    chapter_number: chapterNum,
    title: child.title ?? undefined,
    slug: chapterSlug,
    status: 'published',
  });

  const images = child.edited_images ?? extractImagesFromResult(child.result);
  const pages: Array<{ page_number: number; image_path: string; width?: number; height?: number }> = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imagePath = `series/${targetSeriesId}/chapters/${chapter.id}/page-${i + 1}.img`;
    const dims = await fetchAndStoreImage(img.src, imagePath);
    pages.push({ page_number: i + 1, image_path: imagePath, width: dims?.width, height: dims?.height });
  }
  chapter = await setChapterPages(chapter.id, pages) ?? chapter;

  await db.query('UPDATE scrape_records SET synced = true, updated_at = NOW() WHERE id = $1', [childId]);
  await notifySeriesFollowers(targetSeriesId, chapter.id, `New chapter ${chapterNum} is available!`);
  return chapter;
}

export async function syncScrapeParentAll(parentId: string): Promise<{ series: Series | null; chapters: Chapter[] }> {
  const series = await syncScrapeParentToSeries(parentId);
  if (!series) return { series: null, chapters: [] };
  const children = await getScrapeChildren(parentId);
  const chapters: Chapter[] = [];
  for (const child of children) {
    const ch = await syncScrapeChildToChapter(child.id, series.id);
    if (ch) chapters.push(ch);
  }
  return { series, chapters };
}

function extractImagesFromResult(result: Record<string, unknown> | null): ImageItem[] {
  if (!result) return [];
  const imagesData = result.images as { images?: ImageItem[] } | undefined;
  return imagesData?.images ?? [];
}

// ─── Image Upload Helpers ──────────────────────────────

export async function storeImageForChapter(seriesId: string, chapterId: string, pageNumber: number, file: File): Promise<{ image_path: string; width: number; height: number }> {
  const imagePath = `series/${seriesId}/chapters/${chapterId}/page-${pageNumber}.img`;
  await storeImage(imagePath, file);
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
  return { image_path: imagePath, width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
}

export async function storeCoverImage(seriesId: string, file: File): Promise<string> {
  const imagePath = `series/${seriesId}/cover.img`;
  await storeImage(imagePath, file);
  return imagePath;
}

// ─── Admin Stats ───────────────────────────────────────

export async function getAdminStats(): Promise<{
  seriesCount: number; chapterCount: number; userCount: number; scrapeCount: number; draftCount: number; publishedCount: number;
}> {
  const db = await getDb();
  const [s, c, u, sc, d, p] = await Promise.all([
    db.query('SELECT COUNT(*) as cnt FROM series'),
    db.query('SELECT COUNT(*) as cnt FROM chapters'),
    db.query('SELECT COUNT(*) as cnt FROM users'),
    db.query('SELECT COUNT(*) as cnt FROM scrape_records WHERE saved = true'),
    db.query("SELECT COUNT(*) as cnt FROM chapters WHERE status = 'draft'"),
    db.query("SELECT COUNT(*) as cnt FROM chapters WHERE status = 'published'"),
  ]);
  return {
    seriesCount: (s.rows[0] as Record<string, number>).cnt,
    chapterCount: (c.rows[0] as Record<string, number>).cnt,
    userCount: (u.rows[0] as Record<string, number>).cnt,
    scrapeCount: (sc.rows[0] as Record<string, number>).cnt,
    draftCount: (d.rows[0] as Record<string, number>).cnt,
    publishedCount: (p.rows[0] as Record<string, number>).cnt,
  };
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  const result = await db.query('SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC');
  return result.rows as User[];
}
