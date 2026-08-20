import axios from "axios";
import * as cheerio from "cheerio";
import slugify from "slugify";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 30000,
    maxRedirects: 5,
    responseType: "text",
    responseEncoding: "utf8",
  });
  return res.data;
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Detect the source site type from a URL.
 * Currently supports generic manga sites via common patterns.
 */
function detectSource(url) {
  const host = extractHostname(url);
  if (!host) return "unknown";
  if (host.includes("mangadex")) return "mangadex";
  if (host.includes("mangakakalot") || host.includes("manganato") || host.includes("chapmanganato"))
    return "mangakakalot";
  if (host.includes("mangaupdates")) return "mangaupdates";
  if (host.includes("myanimelist")) return "myanimelist";
  if (host.includes("anilist")) return "anilist";
  return "generic";
}

/**
 * Scrape series metadata from a source URL.
 * Returns a structured parent object with title, description, cover, genres, etc.
 *
 * Supports common manga site patterns: OpenGraph tags, JSON-LD, meta tags,
 * and site-specific selectors for mangakakalot/manganato family.
 */
export async function scrapeParent(sourceUrl) {
  const html = await fetchPage(sourceUrl);
  const $ = cheerio.load(html);
  const source = detectSource(sourceUrl);
  const hostname = extractHostname(sourceUrl);
  void source; // reserved for future source-specific logic

  // --- Title ---
  let title =
    $('meta[property="og:title"]').attr("content") ||
    $('h1').first().text().trim() ||
    $("title").text().trim() ||
    $("h1.story-title").text().trim() ||
    $('h1[itemprop="name"]').text().trim();

  // mangakakalot/manganato specific
  if (!title || title.length < 2) {
    title = $("h1.story-title, h1.title, .story-info-right h1, .panel-story-chapter-list .panel-story-chapter-list h3")
      .first()
      .text()
      .trim();
  }

  // Clean up title suffixes
  if (title) {
    title = title.replace(/\s*(Manga|Manhwa|Manhua|Webtoon)\s*$/i, "").replace(/\s*\|\s*.*/i, "").trim();
  }

  if (!title || title.length < 1) {
    throw new Error("Could not extract series title from the page.");
  }

  // --- Slug ---
  const slug = slugify(title, { lower: true, strict: true, locale: "en" });

  // --- Description ---
  let description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    $("#panel-story-info-description").text().trim() ||
    $('[itemprop="description"]').text().trim() ||
    $(".story-info-discription p").eq(1).text().trim() ||
    "";

  description = description.replace(/^Description\s*:?\s*/i, "").trim();

  // --- Cover image ---
  let coverUrl =
    $('meta[property="og:image"]').attr("content") ||
    $(".info-image img").attr("src") ||
    $(".story-info-left img").attr("src") ||
    $('img[itemprop="image"]').attr("src") ||
    $(".content-img").first().attr("src");

  if (coverUrl && !coverUrl.startsWith("http")) {
    try {
      coverUrl = new URL(coverUrl, sourceUrl).href;
    } catch {
      coverUrl = null;
    }
  }

  // --- Author / Artist ---
  let author = $('p:contains("Author") a, .y6x11u a, [itemprop="author"]').first().text().trim() || null;
  if (!author) {
    const authorText = $("#panel-story-info-description").text();
    const m = authorText.match(/Author\s*:\s*(.+)/i);
    if (m) author = m[1].trim();
  }
  const artist = author; // Often the same; can be refined per source

  // --- Status ---
  let status = "unknown";
  const statusText =
    $("td:contains('Status')").next().text().trim() ||
    $(".info-status").text().trim() ||
    $('[itemprop="bookStatus"]').text().trim() ||
    "";
  if (/ongoing|publishing/i.test(statusText)) status = "ongoing";
  else if (/completed|complete/i.test(statusText)) status = "completed";
  else if (/hiatus|paused/i.test(statusText)) status = "hiatus";
  else if (/cancelled|canceled/i.test(statusText)) status = "cancelled";

  // --- Genres ---
  let genres = [];
  // mangakakalot pattern
  $("td:contains('Genres') a, .genres a, [itemprop='genre'] a, .manga-info-tags a").each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });
  // fallback: meta keywords
  if (genres.length === 0) {
    const kw = $('meta[name="keywords"]').attr("content");
    if (kw) {
      genres = kw
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g.length > 1 && g.length < 30)
        .slice(0, 10);
    }
  }

  // --- Tags ---
  const tags = [];

  // --- Year ---
  let year = null;
  const yearText = $("td:contains('Released')").next().text().trim() || $("[itemprop='datePublished']").text().trim();
  const yearMatch = yearText.match(/(\d{4})/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // --- Rating ---
  let rating = null;
  const ratingText =
    $('[itemprop="ratingValue"]').text().trim() ||
    $(".rate-number").text().trim() ||
    $("#rate_row_cmd").text().trim();
  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
  if (ratingMatch) rating = parseFloat(ratingMatch[1]);

  // --- Type ---
  let type = "unknown";
  if (/manhwa/i.test(title) || /manhwa/i.test(sourceUrl)) type = "manhwa";
  else if (/manhua/i.test(title) || /manhua/i.test(sourceUrl)) type = "manhua";
  else if (/webtoon/i.test(sourceUrl)) type = "webtoon";
  else if (hostname && hostname.includes("mangadex")) {
    type = "manga";
  }

  return {
    title,
    slug,
    description: description || "",
    coverUrl: coverUrl || null,
    author: author || null,
    artist: artist || null,
    status,
    genres,
    tags,
    sourceUrl,
    sourceName: hostname,
    year,
    rating,
    type,
  };
}

/**
 * Scrape the list of chapter URLs from a series page.
 * Returns [{ chapterNumber, chapterTitle, url }] sorted ascending by chapter number.
 *
 * Supports common manga reader patterns (mangakakalot/manganato, generic).
 */
export async function scrapeChapterList(sourceUrl) {
  const html = await fetchPage(sourceUrl);
  const $ = cheerio.load(html);

  const chapters = [];

  // mangakakalot/manganato chapter list
  $(".row-content-chapter li, .chapter-list .row, .a-h a, ul.row-content-chapter a").each((_, el) => {
    const $el = $(el);
    const link = $el.is("a") ? $el : $el.find("a").first();
    const href = link.attr("href");
    const text = link.text().trim() || $el.find("a").text().trim();
    if (!href || !text) return;

    let num = null;
    const numMatch = text.match(/chapter\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (numMatch) num = parseFloat(numMatch[1]);
    if (num === null) {
      const fallback = text.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (fallback) num = parseFloat(fallback[1]);
    }
    if (num === null) return;

    let fullUrl = href;
    if (!fullUrl.startsWith("http")) {
      try {
        fullUrl = new URL(href, sourceUrl).href;
      } catch {
        return;
      }
    }

    const title = text.replace(/^Chapter\s*[0-9.]+\s*:?\s*/i, "").trim() || null;
    chapters.push({ chapterNumber: num, chapterTitle: title, url: fullUrl });
  });

  // Dedupe by chapter number, keep first
  const seen = new Set();
  const unique = [];
  for (const ch of chapters) {
    if (seen.has(ch.chapterNumber)) continue;
    seen.add(ch.chapterNumber);
    unique.push(ch);
  }

  // Sort ascending
  unique.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return unique;
}

export { fetchPage, detectSource, extractHostname };
