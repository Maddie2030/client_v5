import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * ScraperParent — represents a series scraped from a source.
 * Stores all metadata (title, description, cover, genres, author, status, source URL).
 * Acts as the parent document that child chapter scrapes attach to.
 */
const ScraperParentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    coverUrl: { type: String, default: null },
    coverMinioObject: { type: String, default: null },
    author: { type: String, default: null },
    artist: { type: String, default: null },
    status: { type: String, enum: ["ongoing", "completed", "hiatus", "cancelled", "unknown"], default: "unknown" },
    genres: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    sourceUrl: { type: String, required: true },
    sourceName: { type: String, default: null },
    year: { type: Number, default: null },
    rating: { type: Number, default: null },
    type: { type: String, enum: ["manga", "manhwa", "manhua", "webtoon", "comic", "unknown"], default: "unknown" },
    childCount: { type: Number, default: 0 },
    syncedToCatalog: { type: Boolean, default: false },
    catalogSeriesId: { type: String, default: null },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ScraperParentSchema.index({ title: "text", description: "text" });

export const ScraperParent = model("ScraperParent", ScraperParentSchema, "scraper_parents");

/**
 * ScraperChild — represents a chapter scrape attached to a parent series.
 * Stores chapter metadata + image info. The actual image files are pushed to MinIO
 * as objects named <parentSlug>-chapter-<number>-webp<NNN>.webp, and the MinIO object keys
 * are stored in the `pages` array. The child references its parent via parentSlug.
 */
const PageSchema = new Schema(
  {
    pageNumber: { type: Number, required: true },
    originalUrl: { type: String, required: true },
    minioBucket: { type: String, required: true },
    minioObject: { type: String, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    sizeBytes: { type: Number, default: null },
  },
  { _id: false },
);

const ScraperChildSchema = new Schema(
  {
    parentSlug: { type: String, required: true, index: true },
    parentId: { type: String, required: true, index: true },
    chapterNumber: { type: Number, required: true },
    chapterTitle: { type: String, default: null },
    slug: { type: String, required: true, lowercase: true, trim: true },
    sourceUrl: { type: String, required: true },
    pageCount: { type: Number, default: 0 },
    pages: { type: [PageSchema], default: [] },
    minioBucket: { type: String, required: true },
    position: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "scraping", "completed", "error"], default: "pending" },
    errorMsg: { type: String, default: null },
    syncedToCatalog: { type: Boolean, default: false },
    catalogChapterId: { type: String, default: null },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ScraperChildSchema.index({ parentSlug: 1, chapterNumber: 1 }, { unique: true });
ScraperChildSchema.index({ parentId: 1, position: 1 });

export const ScraperChild = model("ScraperChild", ScraperChildSchema, "scraper_children");
