import { Router } from "express";
import { ScraperParent } from "../models/ScrapeModels.js";
import { scrapeParent, scrapeChapterList } from "../services/parentScraper.js";
import { minioClient, DEFAULT_BUCKET, buildCoverObjectKey, ensureBucket } from "../config/minio.js";
import axios from "axios";
import sharp from "sharp";
import { Readable } from "stream";

export const parentRouter = Router();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * POST /api/scraper/parent/scrape
 * Body: { url }
 * Scrapes series metadata from the source URL and creates a ScraperParent in MongoDB.
 */
parentRouter.post("/scrape", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    const data = await scrapeParent(url);

    // Check if a parent with this slug already exists
    const existing = await ScraperParent.findOne({ slug: data.slug });
    if (existing) {
      // Update the existing parent with fresh metadata
      const updated = await ScraperParent.findByIdAndUpdate(
        existing._id,
        { $set: { ...data, scrapedAt: new Date() } },
        { new: true },
      );
      return res.json({ parent: updated, message: "Parent already existed — metadata updated." });
    }

    const parent = new ScraperParent(data);
    await parent.save();
    res.status(201).json({ parent });
  } catch (err) {
    console.error("[parent/scrape] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/parent
 * List all parents, with optional search, pagination.
 */
parentRouter.get("/", async (req, res) => {
  try {
    const { search, limit = 20, offset = 0 } = req.query;
    const lim = Math.min(parseInt(limit, 10), 100);
    const off = parseInt(offset, 10);

    const filter = {};
    if (search) {
      filter.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }];
    }

    const [parents, total] = await Promise.all([
      ScraperParent.find(filter).sort({ updatedAt: -1 }).skip(off).limit(lim),
      ScraperParent.countDocuments(filter),
    ]);

    res.json({ parents, total, limit: lim, offset: off });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/parent/:id
 * Get a single parent with its children (chapters).
 */
parentRouter.get("/:id", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    // Import ScraperChild lazily to avoid circular deps
    const { ScraperChild } = await import("../models/ScrapeModels.js");
    const children = await ScraperChild.find({ parentId: String(parent._id) })
      .sort({ chapterNumber: 1 })
      .select("-pages");

    res.json({ parent, children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scraper/parent/:id/chapters
 * Get the list of available chapters from the source (does not scrape images).
 */
parentRouter.get("/:id/chapter-list", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    const chapters = await scrapeChapterList(parent.sourceUrl);
    res.json({ chapters, count: chapters.length });
  } catch (err) {
    console.error("[parent/chapter-list] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/scraper/parent/:id
 * Delete a parent and all its children (and optionally MinIO objects).
 */
parentRouter.delete("/:id", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    const { ScraperChild } = await import("../models/ScrapeModels.js");

    // Delete child documents
    const children = await ScraperChild.find({ parentId: String(parent._id) });
    for (const child of children) {
      // Delete MinIO objects for each child
      for (const page of child.pages) {
        try {
          await minioClient.removeObject(page.minioBucket, page.minioObject);
        } catch {
          // ignore
        }
      }
    }
    await ScraperChild.deleteMany({ parentId: String(parent._id) });

    // Delete cover from MinIO if it exists
    if (parent.coverMinioObject) {
      try {
        await minioClient.removeObject(DEFAULT_BUCKET, parent.coverMinioObject);
      } catch {
        // ignore
      }
    }

    await ScraperParent.findByIdAndDelete(req.params.id);
    res.json({ message: "Parent and all children deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scraper/parent/:id/download-cover
 * Downloads the cover image for a parent, converts to WebP, and stores in MinIO.
 */
parentRouter.post("/:id/download-cover", async (req, res) => {
  try {
    const parent = await ScraperParent.findById(req.params.id);
    if (!parent) return res.status(404).json({ error: "Parent not found" });
    if (!parent.coverUrl) return res.status(400).json({ error: "No cover URL available for this parent" });

    await ensureBucket(DEFAULT_BUCKET);

    const coverKey = buildCoverObjectKey(parent.slug);

    // Download cover image
    const response = await axios.get(parent.coverUrl, {
      headers: { "User-Agent": USER_AGENT, Referer: parent.sourceUrl || "" },
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const rawBuffer = Buffer.from(response.data);
    const webpBuffer = await sharp(rawBuffer).webp({ quality: 85 }).toBuffer();

    const stream = Readable.from([webpBuffer]);
    await minioClient.putObject(DEFAULT_BUCKET, coverKey, stream, webpBuffer.length, {
      "Content-Type": "image/webp",
    });

    parent.coverMinioObject = coverKey;
    await parent.save();

    res.json({ message: "Cover downloaded and stored.", coverMinioObject: coverKey });
  } catch (err) {
    console.error("[parent/download-cover] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
