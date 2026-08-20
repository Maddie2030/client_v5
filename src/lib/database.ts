import { PGlite } from '@electric-sql/pglite';

let dbInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'user',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genres (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS series (
    id               TEXT PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    slug             VARCHAR(255) UNIQUE NOT NULL,
    description      TEXT,
    cover_image_path VARCHAR(500),
    status           VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS series_genres (
    series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
    genre_id  INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (series_id, genre_id)
);

CREATE TABLE IF NOT EXISTS chapters (
    id             TEXT PRIMARY KEY,
    series_id      TEXT REFERENCES series(id) ON DELETE CASCADE,
    chapter_number NUMERIC(8,2) NOT NULL,
    title          VARCHAR(255),
    slug           VARCHAR(255) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft',
    page_count     INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (series_id, chapter_number),
    UNIQUE (series_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_chapters_series_id
ON chapters(series_id);

CREATE TABLE IF NOT EXISTS pages (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_path  VARCHAR(500) NOT NULL,
    width       INTEGER,
    height      INTEGER,

    UNIQUE (chapter_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_pages_chapter_id
ON pages(chapter_id);

CREATE TABLE IF NOT EXISTS reading_progress (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
    chapter_id      TEXT REFERENCES chapters(id) ON DELETE CASCADE,
    last_page       INTEGER NOT NULL DEFAULT 1,
    scroll_position INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS reading_history (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
    series_id  TEXT REFERENCES series(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE,
    read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reading_history_user_id
ON reading_history(user_id);

CREATE TABLE IF NOT EXISTS bookmarks (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
    series_id  TEXT REFERENCES series(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, series_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
    series_id  TEXT REFERENCES series(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, series_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
    series_id  TEXT REFERENCES series(id) ON DELETE SET NULL,
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    message    VARCHAR(500) NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
ON notifications(user_id);

CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    series_id  TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE,
    parent_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_context
ON comments(series_id, chapter_id, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
ON comments(parent_id);

CREATE TABLE IF NOT EXISTS scrape_records (
    id            TEXT PRIMARY KEY,
    url           TEXT NOT NULL,
    mode          VARCHAR(20) NOT NULL,
    title         TEXT,
    summary       TEXT,
    status        VARCHAR(10) NOT NULL DEFAULT 'success',
    result        JSONB,
    error         TEXT,
    parent_id     TEXT REFERENCES scrape_records(id) ON DELETE CASCADE,
    position      INTEGER,
    unique_key    TEXT UNIQUE,
    edited_text   JSONB,
    edited_images JSONB,
    saved         BOOLEAN NOT NULL DEFAULT false,
    synced        BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_url
ON scrape_records(url);

CREATE INDEX IF NOT EXISTS idx_scrape_parent_id
ON scrape_records(parent_id, position);

-- Normal PostgreSQL indexes.
-- pg_trgm / gin_trgm_ops intentionally NOT used because
-- pg_trgm is not available in the standard PGlite build.

CREATE INDEX IF NOT EXISTS idx_series_title
ON series(title);

CREATE INDEX IF NOT EXISTS idx_series_slug
ON series(slug);
`;

const SEED_SQL = `
INSERT INTO genres (name) VALUES
  ('Action'),
  ('Adventure'),
  ('Romance'),
  ('Comedy'),
  ('Drama'),
  ('Fantasy'),
  ('Sci-Fi'),
  ('Horror'),
  ('Mystery'),
  ('Thriller'),
  ('Slice of Life'),
  ('Supernatural'),
  ('Sports'),
  ('Historical'),
  ('Psychological')
ON CONFLICT (name) DO NOTHING;
`;

export async function getDb(): Promise<PGlite> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = new PGlite('idb://muller-db');

    try {
      await db.exec(SCHEMA_SQL);
      await db.exec(SEED_SQL);

      const result = await db.query<{ cnt: string }>(
        'SELECT COUNT(*) AS cnt FROM users WHERE role = $1',
        ['admin'],
      );

      const adminCount = Number(result.rows[0]?.cnt ?? 0);

      if (adminCount === 0) {
        const salt = crypto.randomUUID();
        const hash = await hashPassword('admin123', salt);

        await db.query(
          `
          INSERT INTO users (
            id,
            username,
            email,
            password_hash,
            password_salt,
            role,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, 'admin', true)
          `,
          [
            crypto.randomUUID().replace(/-/g, ''),
            'admin',
            'admin@muller.local',
            hash,
            salt,
          ],
        );
      }

      dbInstance = db;
      return db;
    } catch (error) {
      initPromise = null;

      console.error('Failed to initialize PGlite database:', error);

      throw error;
    }
  })();

  return initPromise;
}

async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const hash = await hashPassword(password, salt);

  return hash === expectedHash;
}

export { hashPassword };