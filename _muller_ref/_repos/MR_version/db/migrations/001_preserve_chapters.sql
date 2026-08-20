-- Keep this migration for databases created before chapter uploads became
-- append-only. The application also checks for conflicts before processing
-- archives, while this constraint protects concurrent uploads.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_chapters_series_slug'
    ) THEN
        ALTER TABLE chapters
            ADD CONSTRAINT uq_chapters_series_slug UNIQUE (series_id, slug);
    END IF;
END $$;