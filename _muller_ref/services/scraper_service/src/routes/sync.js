import { Router } from "express";
import axios from "axios";
import { ScraperParent, ScraperChild } from "../models/ScrapeModels.js";

export const syncRouter = Router();

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || "http://catalog_service:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (INTERNAL_API_KEY) {
    headers["X-Internal-Key"] = INTERNAL_API_KEY;
  }
  return headers;
}

/**
 * POST /api/scraper/sync/parent/:id
 * Syncs a parent series from MongoDB into the Postgres catalog.
 * Creates the series if it doesn't exist, or updates it.
 * Marks the parent as syncedToCatalog=true and stores catalogSeriesId.
 */
syncRouter.post("/parent/:id", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    const coverPath = parent.coverMinioObject || parent.coverUrl || null;

    if (parent.syncedToCatalog && parent.catalogSeriesId) {
      const updateRes = await axios.put(
        `${CATALOG_SERVICE_URL}/api/catalog/series/${parent.catalogSeriesId}`,
        {
          title: parent.title,
          description: parent.description,
          cover_image_path: coverPath,
          status: parent.status,
        },
        { headers: authHeaders(), timeout: 10000 },
      );
      res.json({ message: "Series updated in catalog.", series: updateRes.data, parent });
      return;
    }

    const createRes = await axios.post(
      `${CATALOG_SERVICE_URL}/api/catalog/series`,
      {
        title: parent.title,
        slug: parent.slug,
        description: parent.description,
        cover_image_path: coverPath,
        status: parent.status,
      },
      { headers: authHeaders(), timeout: 10000 },
    );

    parent.syncedToCatalog = true;
    parent.catalogSeriesId = createRes.data.id;
    await parent.save();

    res.status(201).json({ message: "Series synced to catalog.", series: createRes.data, parent });
  } catch (err) {
    console.error("[sync/parent] Error:", err.response?.data || err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.response?.data?.detail || err.message,
      detail: "Failed to sync parent to catalog. Ensure INTERNAL_API_KEY is configured.",
    });
  }
});

/**
 * POST /api/scraper/sync/child/:id
 * Syncs a child chapter from MongoDB into the Postgres catalog.
 * Requires the parent to be synced first (needs catalogSeriesId).
 * Creates the chapter in the catalog, pushes page data, and marks child as synced.
 */
syncRouter.post("/child/:id", async (req, res) => {
  try {
    const child = await ScraperChild.findById(req.params.id);
    if (!child) return res.status(404).json({ error: "Child not found" });

    const parent = await ScraperParent.findById(child.parentId);
    if (!parent) return res.status(404).json({ error: "Parent not found" });
    if (!parent.syncedToCatalog || !parent.catalogSeriesId) {
      return res.status(400).json({ error: "Parent must be synced to catalog first." });
    }

    if (child.syncedToCatalog && child.catalogChapterId) {
      return res.json({ message: "Child already synced.", child });
    }

    const chapterSlug = `chapter-${String(child.chapterNumber).replace(/[^0-9.]/g, "")}`;
    const createRes = await axios.post(
      `${CATALOG_SERVICE_URL}/api/catalog/series/${parent.catalogSeriesId}/chapters`,
      {
        chapter_number: child.chapterNumber,
        title: child.chapterTitle,
        slug: chapterSlug,
        status: "published",
      },
      { headers: authHeaders(), timeout: 10000 },
    );

    const catalogChapterId = createRes.data.id;

    if (child.pages && child.pages.length > 0) {
      await axios.post(
        `${CATALOG_SERVICE_URL}/api/catalog/series/${parent.catalogSeriesId}/chapters/${catalogChapterId}/pages`,
        {
          pages: child.pages.map((p) => ({
            page_number: p.pageNumber,
            image_path: `minio/${p.minioObject}`,
            width: p.width,
            height: p.height,
          })),
        },
        { headers: authHeaders(), timeout: 30000 },
      );
    }

    child.syncedToCatalog = true;
    child.catalogChapterId = catalogChapterId;
    await child.save();

    res.status(201).json({ message: "Chapter synced to catalog.", chapter: createRes.data, child });
  } catch (err) {
    console.error("[sync/child] Error:", err.response?.data || err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.response?.data?.detail || err.message,
    });
  }
});

/**
 * POST /api/scraper/sync/parent/:id/all
 * Syncs a parent and all its children to the catalog in one operation.
 */
syncRouter.post("/parent/:id/all", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    if (!parent.syncedToCatalog || !parent.catalogSeriesId) {
      const coverPath = parent.coverMinioObject || parent.coverUrl || null;

      const createRes = await axios.post(
        `${CATALOG_SERVICE_URL}/api/catalog/series`,
        {
          title: parent.title,
          slug: parent.slug,
          description: parent.description,
          cover_image_path: coverPath,
          status: parent.status,
        },
        { headers: authHeaders(), timeout: 10000 },
      );

      parent.syncedToCatalog = true;
      parent.catalogSeriesId = createRes.data.id;
      await parent.save();
    }

    const children = await ScraperChild.find({ parentId: String(parent._id), status: "completed" }).sort({
      chapterNumber: 1,
    });

    const results = { synced: 0, skipped: 0, errors: 0 };
    for (const child of children) {
      if (child.syncedToCatalog && child.catalogChapterId) {
        results.skipped++;
        continue;
      }
      try {
        const chapterSlug = `chapter-${String(child.chapterNumber).replace(/[^0-9.]/g, "")}`;
        const createRes = await axios.post(
          `${CATALOG_SERVICE_URL}/api/catalog/series/${parent.catalogSeriesId}/chapters`,
          {
            chapter_number: child.chapterNumber,
            title: child.chapterTitle,
            slug: chapterSlug,
            status: "published",
          },
          { headers: authHeaders(), timeout: 10000 },
        );

        const catalogChapterId = createRes.data.id;

        if (child.pages && child.pages.length > 0) {
          await axios.post(
            `${CATALOG_SERVICE_URL}/api/catalog/series/${parent.catalogSeriesId}/chapters/${catalogChapterId}/pages`,
            {
              pages: child.pages.map((p) => ({
                page_number: p.pageNumber,
                image_path: `minio/${p.minioObject}`,
                width: p.width,
                height: p.height,
              })),
            },
            { headers: authHeaders(), timeout: 30000 },
          );
        }

        child.syncedToCatalog = true;
        child.catalogChapterId = catalogChapterId;
        await child.save();
        results.synced++;
      } catch (err) {
        console.error(`[sync/all] Chapter ${child.chapterNumber} failed: ${err.message}`);
        results.errors++;
      }
    }

    res.json({
      message: "Sync complete.",
      parent,
      results,
    });
  } catch (err) {
    console.error("[sync/all] Error:", err.response?.data || err.message);
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data?.detail || err.message });
  }
});
