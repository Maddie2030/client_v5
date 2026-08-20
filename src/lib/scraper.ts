import { Readability } from '@mozilla/readability';
import type { ScrapeMode, ScrapeResult, ImageItem } from '@/types';

function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split('?')[0].split('#')[0].endsWith('.pdf');
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchPage(url: string): Promise<string> {
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Try direct fetch first (works if the site sends CORS headers)
  try {
    const response = await fetch(url, { headers, mode: 'cors' });
    if (response.ok) return await response.text();
  } catch { /* fall through to proxy */ }

  // Try CORS proxies as fallback
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy(url), { headers });
      if (response.ok) return await response.text();
    } catch { /* try next proxy */ }
  }

  throw new Error(`Failed to fetch ${url}. The site may be offline or blocking requests.`);
}

function getMeta(doc: Document, selector: string): string | null {
  const el = doc.querySelector(selector);
  if (!el) return null;
  return el.getAttribute('content') || el.textContent?.trim() || null;
}

function extractMetadata(doc: Document) {
  return {
    title: doc.querySelector('title')?.textContent?.trim() || null,
    description: getMeta(doc, 'meta[name="description"]') || getMeta(doc, 'meta[property="og:description"]'),
    ogTitle: getMeta(doc, 'meta[property="og:title"]'),
    ogImage: getMeta(doc, 'meta[property="og:image"]'),
    ogSiteName: getMeta(doc, 'meta[property="og:site_name"]'),
    ogType: getMeta(doc, 'meta[property="og:type"]'),
    twitterCard: getMeta(doc, 'meta[name="twitter:card"]'),
    twitterTitle: getMeta(doc, 'meta[name="twitter:title"]'),
    twitterImage: getMeta(doc, 'meta[name="twitter:image"]'),
    keywords: getMeta(doc, 'meta[name="keywords"]'),
    author: getMeta(doc, 'meta[name="author"]') || getMeta(doc, 'meta[property="article:author"]'),
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
    lang: doc.documentElement.getAttribute('lang') || null,
    favicon: doc.querySelector('link[rel="icon"]')?.getAttribute('href') || doc.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') || null,
  };
}

function extractLinks(doc: Document, pageUrl: string) {
  const baseUrl = new URL(pageUrl);
  const links = new Set<string>();
  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();

  doc.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    try {
      const absolute = new URL(href, pageUrl).href;
      links.add(absolute);
      if (new URL(absolute).hostname === baseUrl.hostname) internalLinks.add(absolute);
      else externalLinks.add(absolute);
    } catch { /* skip invalid */ }
  });

  return {
    all: Array.from(links).sort(),
    internal: Array.from(internalLinks).sort(),
    external: Array.from(externalLinks).sort(),
    count: links.size,
    internalCount: internalLinks.size,
    externalCount: externalLinks.size,
  };
}

function extractImages(doc: Document, pageUrl: string): { images: ImageItem[]; count: number } {
  const images = new Map<string, ImageItem>();
  doc.querySelectorAll('img').forEach((el) => {
    const imgEl = el as HTMLImageElement;
    const src = imgEl.src || imgEl.getAttribute('data-src');
    if (!src) return;
    try {
      const absolute = new URL(src, pageUrl).href;
      if (!images.has(absolute)) {
        images.set(absolute, {
          src: absolute,
          alt: imgEl.getAttribute('alt') || '',
          width: imgEl.getAttribute('width') || imgEl.naturalWidth || null,
          height: imgEl.getAttribute('height') || imgEl.naturalHeight || null,
        });
      }
    } catch { /* skip */ }
  });
  return { images: Array.from(images.values()), count: images.size };
}

function extractHeadings(doc: Document) {
  const headings: Array<{ level: number; tag: string; text: string }> = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim();
    if (text) headings.push({ level: parseInt(tag.charAt(1)), tag, text });
  });
  return headings;
}

function extractText(doc: Document): string {
  doc.querySelectorAll('script, style, noscript, iframe, svg').forEach((el) => el.remove());
  return doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function extractStructuredText(doc: Document) {
  const blocks: Array<{ tag: string; text: string }> = [];
  doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim();
    if (text && text.length > 1) blocks.push({ tag, text });
  });
  return blocks;
}

function extractArticle(html: string) {
  const doc = parseHtml(html);
  try {
    const reader = new Readability(doc, { charThreshold: 200 });
    const article = reader.parse();
    if (!article) return null;
    return {
      title: article.title || null,
      byline: article.byline || null,
      dir: article.dir || null,
      content: article.content || null,
      textContent: article.textContent?.trim() || null,
      length: article.length || 0,
      excerpt: article.excerpt || null,
      siteName: article.siteName || null,
      readingTimeMinutes: article.length ? Math.ceil(article.length / 500) : 0,
    };
  } catch {
    return null;
  }
}

async function scrapeArticle(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const article = extractArticle(html);
  const metadata = extractMetadata(doc);
  if (!article) {
    return {
      url, mode: 'article', title: metadata.title, summary: metadata.description,
      status: 'success', result: { metadata, links: extractLinks(doc, url) },
    };
  }
  return {
    url, mode: 'article', title: article.title || metadata.title,
    summary: article.excerpt || metadata.description, status: 'success',
    result: { article, metadata },
  };
}

async function scrapeText(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const metadata = extractMetadata(doc);
  const fullText = extractText(doc);
  const structured = extractStructuredText(doc);
  const headings = extractHeadings(doc);
  return {
    url, mode: 'text', title: metadata.title,
    summary: metadata.description || fullText.slice(0, 200), status: 'success',
    result: { fullText, textLength: fullText.length, wordCount: fullText.split(/\s+/).filter(Boolean).length, structured, headings, metadata },
  };
}

async function scrapeLinks(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const metadata = extractMetadata(doc);
  const links = extractLinks(doc, url);
  return {
    url, mode: 'links', title: metadata.title,
    summary: `Found ${links.count} links (${links.internalCount} internal, ${links.externalCount} external)`,
    status: 'success', result: { links, metadata },
  };
}

async function scrapeImages(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const metadata = extractMetadata(doc);
  const images = extractImages(doc, url);
  return {
    url, mode: 'images', title: metadata.title,
    summary: `Found ${images.count} images`, status: 'success',
    result: { images, metadata },
  };
}

async function scrapeMetadata(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const metadata = extractMetadata(doc);
  const headings = extractHeadings(doc);
  const stats = {
    linkCount: doc.querySelectorAll('a').length,
    imageCount: doc.querySelectorAll('img').length,
    scriptCount: doc.querySelectorAll('script').length,
    styleCount: doc.querySelectorAll('style').length,
    formCount: doc.querySelectorAll('form').length,
    tableCount: doc.querySelectorAll('table').length,
    headingCount: headings.length,
  };
  return {
    url, mode: 'metadata', title: metadata.title, summary: metadata.description,
    status: 'success', result: { metadata, headings, stats },
  };
}

async function scrapeFull(url: string): Promise<ScrapeResult> {
  const html = await fetchPage(url);
  const doc = parseHtml(html);
  const article = extractArticle(html);
  const metadata = extractMetadata(doc);
  const links = extractLinks(doc, url);
  const images = extractImages(doc, url);
  const headings = extractHeadings(doc);
  const fullText = extractText(doc);
  return {
    url, mode: 'full', title: article?.title || metadata.title || url,
    summary: article?.excerpt || metadata.description || fullText.slice(0, 200),
    status: 'success', result: { article, metadata, links, images, headings, fullText, textLength: fullText.length, wordCount: fullText.split(/\s+/).filter(Boolean).length },
  };
}

export async function scrape(url: string, mode: ScrapeMode): Promise<ScrapeResult> {
  const normalizedUrl = normalizeUrl(url);
  if (isPdfUrl(normalizedUrl) && mode !== 'pdf') {
    return {
      url: normalizedUrl, mode, title: 'PDF Document',
      summary: 'URL points to a PDF. Use full mode for text extraction.',
      status: 'error', result: null, error: 'URL is a PDF file. Switch to full mode to extract text from it.',
    };
  }
  try {
    switch (mode) {
      case 'article': return await scrapeArticle(normalizedUrl);
      case 'text': return await scrapeText(normalizedUrl);
      case 'links': return await scrapeLinks(normalizedUrl);
      case 'images': return await scrapeImages(normalizedUrl);
      case 'metadata': return await scrapeMetadata(normalizedUrl);
      case 'full': return await scrapeFull(normalizedUrl);
      case 'pdf': return await scrapeFull(normalizedUrl);
      default: throw new Error(`Unknown scrape mode: ${mode}`);
    }
  } catch (err) {
    return {
      url: normalizedUrl, mode, title: null, summary: null, status: 'error',
      result: null, error: err instanceof Error ? err.message : 'Scrape failed',
    };
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function generateUniqueKey(parentId: string, childId: string): string {
  return `${parentId.slice(0, 8)}-${childId.slice(0, 8)}-${Date.now().toString(36)}`;
}
