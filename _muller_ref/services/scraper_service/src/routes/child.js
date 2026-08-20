import { Router } from "express";
import { ScraperChild, ScraperParent } from "../models/ScrapeModels.js";
import { scrapeChild } from "../services/childScraper.js";
import { minioClient } from "../config/minio.js";

export const childRouter = Router();

/**
 * POST /api/scraper/child/scrape
 * Body: { parentId, chapterNumber?, chapterUrl?, chapterTitle? }
 *
 * If chapterNumber + chapterUrl are provided, scrapes a single chapter.
 * If only parentId is provided, scrapes ALL chapters from the parent source.
 */
childRouter.post("/scrape", async (req, res) => {
  try {
    const { parentId, chapterNumber, chapterUrl, chapterTitle } = req.body;
    if (!parentId) return res.status(400).json({ error: "parentId is required" });

    const parent = await ScraperParent.findById(parentId);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    // Single chapter scrape
    if (chapterUrl && chapterNumber !== undefined) {
      const child = await scrapeChild({
        parentId: String(parent._id),
        parentSlug: parent.slug,
        chapterNumber: parseFloat(chapterNumber),
        chapterTitle: chapterTitle || null,
        chapterUrl,
      });

      // Update parent childCount
      parent.childCount = await ScraperChild.countDocuments({ parentId: String(parent._id) });
      await parent.save();

      return res.status(201).json({ child });
    }

    // Scrape all chapters — return 202 accepted, scrape asynchronously
    const { scrapeChapterList } = await import("../services/parentScraper.js");
    const chapters = await scrapeChapterList(parent.sourceUrl);

    if (chapters.length === 0) {
      return res.status(400).json({ error: "No chapters found on the source page." });
    }

    // Scrape asynchronously
    (async () => {
      let successCount = 0;
      for (const ch of chapters) {
        try {
          await scrapeChild({
            parentId: String(parent._id),
            parentSlug: parent.slug,
            chapterNumber: ch.chapterNumber,
            chapterTitle: ch.chapterTitle,
            chapterUrl: ch.url,
          });
          successCount++;
        } catch (err) {
          console.error(`[child/scrape-all] Chapter ${ch.chapterNumber} failed: ${err.message}`);
        }
      }
      parent.childCount = await ScraperChild.countDocuments({ parentId: String(parent._id) });
      await parent.save();
      console.log(`[child/scrape-all] Completed: ${successCount}/${chapters.length} chapters for ${parent.slug}`);
    })();

    res.status(202).json({ message: "Scraping all chapters in background.", totalChapters: chapters.length });
  } catch (err) {
    console.error("[child/scrape] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/child/parent/:parentId
 * List all children (chapters) for a parent, without page data.
 */
childRouter.get("/parent/:parentId", async (req, res) => {
  try {
    const children = await ScraperChild.find({ parentId: req.params.parentId })
      .sort({ chapterNumber: 1 })
      .select("-pages");
    res.json({ children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/child/:id
 * Get a single child with full page data.
 */
childRouter.get("/:id", async (req, res) => {
  try {
    const child = await ScraperChild.findById(req.params.id);
    if (!child) return res.status(404).json({ error: "Child not found" });
    res.json({ child });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/child/:id/page/:pageNumber
 * Stream a single page image from MinIO.
 */
childRouter.get("/:id/page/:pageNumber", async (req, res) => {
  try {
    const child = await ScraperChild.findById(req.params.id);
    if (!child) return res.status(404).json({ error: "Child not found" });

    const pageNum = parseInt(req.params.pageNumber, 10);
    const page = child.pages.find((p) => p.pageNumber === pageNum);
    if (!page) return res.status(404).json({ error: "Page not found" });

    const stream = await minioClient.getObject(page.minioBucket, page.minioObject);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=3600");
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/scraper/child/:id
 * Delete a child and its MinIO objects.
 */
childRouter.delete("/:id", async (req, res) => {
  try {
    const child = await ScraperChild.findById(req.params.id);
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Delete MinIO objects
    for (const page of child.pages) {
      try {
        await minioClient.removeObject(page.minioBucket, page.minioObject);
      } catch {
        // ignore
      }
    }

    await ScraperChild.findByIdAndDelete(req.params.id);

    // Update parent childCount
    const parent = await ScraperParent.findById(child.parentId);
    if (parent) {
      parent.childCount = await ScraperChild.countDocuments({ parentId: String(parent._id) });
      await parent.save();
    }

    res.json({ message: "Child deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
