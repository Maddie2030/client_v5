import axios from "axios";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { Readable } from "stream";

import { fetchPage } from "./parentScraper.js";
import { minioClient, DEFAULT_BUCKET, buildPageObjectKey, ensureBucket } from "../config/minio.js";
import { ScraperChild } from "../models/ScrapeModels.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Extract all image URLs from a chapter page.
 * Supports lazy-loaded images (data-src, data-srcset) and common manga reader patterns.
 */
async function extractChapterImages(chapterUrl) {
  const html = await fetchPage(chapterUrl);
  const $ = cheerio.load(html);

  const images = [];
  const seen = new Set();

  // Common manga reader container selectors
  const selectors = [
    ".container-chapter-reader img",
    ".reading-content img",
    ".read-content img",
    ".chapter-content img",
    ".pages__img img",
    ".page-chapter img",
    ".content-images img",
    "img.lazy",
    "img[data-src]",
    "img.readimg",
    ".text-center img",
    "figure img",
    "picture img",
    "img",
  ];

  for (const sel of selectors) {
    if (images.length > 0 && !sel.includes("data-src")) continue;
    $(sel).each((_, el) => {
      const $img = $(el);
      let src =
        $img.attr("data-src") ||
        $img.attr("data-original") ||
        $img.attr("data-lazy-src") ||
        $img.attr("srcset")?.split(" ")[0] ||
        $img.attr("data-srcset")?.split(" ")[0] ||
        $img.attr("src");

      if (!src) return;
      // skip placeholder/spacer gifs
      if (src.includes("data:image") || src.includes("loading.gif") || src.includes("placeholder")) return;

      try {
        src = new URL(src, chapterUrl).href;
      } catch {
        return;
      }

      if (!seen.has(src)) {
        seen.add(src);
        images.push(src);
      }
    });

    if (images.length > 0) break;
  }

  return images;
}

/**
 * Download an image from a URL and convert it to WebP buffer.
 * Returns { buffer, width, height, sizeBytes }.
 */
async function downloadAndConvertImage(url, referer) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: referer || "",
      Accept: "image/*,*/*;q=0.8",
    },
    responseType: "arraybuffer",
    timeout: 60000,
    maxRedirects: 5,
  });

  const contentType = res.headers["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType} from ${url}`);
  }

  const rawBuffer = Buffer.from(res.data);
  const webpBuffer = await sharp(rawBuffer)
    .webp({ quality: 85 })
    .toBuffer();

  const metadata = await sharp(webpBuffer).metadata();

  return {
    buffer: webpBuffer,
    width: metadata.width || null,
    height: metadata.height || null,
    sizeBytes: webpBuffer.length,
  };
}

/**
 * Scrape a chapter: extract all page images, download each, convert to WebP,
 * push to MinIO as <parentSlug>-chapter-<chapterNumber>-webp<NNN>.webp,
 * and create a ScraperChild document in MongoDB.
 *
 * @param {Object} params
 * @param {string} params.parentId - Mongo _id of the ScraperParent
 * @param {string} params.parentSlug - slug of the parent series
 * @param {number} params.chapterNumber
 * @param {string} params.chapterTitle
 * @param {string} params.chapterUrl - source URL to scrape
 * @returns {Promise<ScraperChild>}
 */
export async function scrapeChild({ parentId, parentSlug, chapterNumber, chapterTitle, chapterUrl }) {
  await ensureBucket(DEFAULT_BUCKET);

  const chapterSlug = `${parentSlug}-chapter-${String(chapterNumber).replace(/[^0-9.]/g, "")}`;

  // Check if child already exists
  const existing = await ScraperChild.findOne({ parentSlug, chapterNumber });
  if (existing && existing.status === "completed") {
    return existing;
  }

  // Create or update the child document
  let child = existing;
  if (!child) {
    child = new ScraperChild({
      parentId,
      parentSlug,
      chapterNumber,
      chapterTitle: chapterTitle || null,
      slug: chapterSlug,
      sourceUrl: chapterUrl,
      minioBucket: DEFAULT_BUCKET,
      status: "scraping",
    });
  } else {
    child.status = "scraping";
    child.errorMsg = null;
  }
  await child.save();

  try {
    const imageUrls = await extractChapterImages(chapterUrl);
    if (imageUrls.length === 0) {
      throw new Error("No images found on the chapter page.");
    }

    const pages = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const pageNumber = i + 1;
      const objectKey = buildPageObjectKey(parentSlug, chapterNumber, pageNumber);

      try {
        const { buffer, width, height, sizeBytes } = await downloadAndConvertImage(imageUrls[i], chapterUrl);

        const stream = Readable.from([buffer]);
        await minioClient.putObject(DEFAULT_BUCKET, objectKey, stream, buffer.length, {
          "Content-Type": "image/webp",
        });

        pages.push({
          pageNumber,
          originalUrl: imageUrls[i],
          minioBucket: DEFAULT_BUCKET,
          minioObject: objectKey,
          width,
          height,
          sizeBytes,
        });
      } catch (imgErr) {
        console.error(`[scraper-child] Failed page ${pageNumber} of ${chapterSlug}: ${imgErr.message}`);
        // Continue with remaining pages
      }
    }

    if (pages.length === 0) {
      throw new Error("All image downloads failed for this chapter.");
    }

    child.pages = pages;
    child.pageCount = pages.length;
    child.status = "completed";
    child.errorMsg = null;
    await child.save();

    return child;
  } catch (err) {
    child.status = "error";
    child.errorMsg = err.message;
    await child.save();
    throw err;
  }
}
