import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { URL } from 'node:url';
import pdfParse from 'pdf-parse';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TIMEOUT = 30000;

function normalizeUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

function isPdfUrl(url) {
  return url.toLowerCase().split('?')[0].split('#')[0].endsWith('.pdf');
}

function isImageUrl(url) {
  const clean = url.toLowerCase().split('?')[0].split('#')[0];
  return ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].some((ext) =>
    clean.endsWith(ext)
  );
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: TIMEOUT,
    maxRedirects: 5,
    responseType: isPdfUrl(url) ? 'arraybuffer' : 'text',
    responseEncoding: isPdfUrl(url) ? null : 'utf8',
  });
  return response;
}

function extractArticle(html, pageUrl) {
  const { document } = parseHTML(html);
  const reader = new Readability(document, { charThreshold: 200 });
  const article = reader.parse();

  if (!article) {
    return null;
  }

  return {
    title: article.title || null,
    byline: article.byline || null,
    dir: article.dir || null,
    content: article.content || null,
    textContent: article.textContent ? article.textContent.trim() : null,
    length: article.length || 0,
    excerpt: article.excerpt || null,
    siteName: article.siteName || null,
    readingTimeMinutes: article.length ? Math.ceil(article.length / 500) : 0,
  };
}

function extractMetadata($, pageUrl) {
  const getMeta = (selector) => {
    const el = $(selector);
    return el.length ? el.attr('content') || el.text().trim() || null : null;
  };

  const title = $('title').first().text().trim() || null;
  const description = getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]');
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogImage = getMeta('meta[property="og:image"]');
  const ogSiteName = getMeta('meta[property="og:site_name"]');
  const ogType = getMeta('meta[property="og:type"]');
  const twitterCard = getMeta('meta[name="twitter:card"]');
  const twitterTitle = getMeta('meta[name="twitter:title"]');
  const twitterImage = getMeta('meta[name="twitter:image"]');
  const keywords = getMeta('meta[name="keywords"]');
  const author = getMeta('meta[name="author"]') || getMeta('meta[property="article:author"]');
  const canonical = $('link[rel="canonical"]').attr('href') || null;
  const lang = $('html').attr('lang') || null;
  const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || null;

  return {
    title,
    description,
    ogTitle,
    ogImage,
    ogSiteName,
    ogType,
    twitterCard,
    twitterTitle,
    twitterImage,
    keywords,
    author,
    canonical,
    lang,
    favicon,
  };
}

function extractLinks($, pageUrl) {
  const baseUrl = new URL(pageUrl);
  const links = new Set();
  const internalLinks = new Set();
  const externalLinks = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const absolute = new URL(href, pageUrl).href;
      links.add(absolute);
      const linkUrl = new URL(absolute);
      if (linkUrl.hostname === baseUrl.hostname) {
        internalLinks.add(absolute);
      } else {
        externalLinks.add(absolute);
      }
    } catch {
      // invalid URL, skip
    }
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

function extractImages($, pageUrl) {
  const images = new Map();
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src) return;
    try {
      const absolute = new URL(src, pageUrl).href;
      if (!images.has(absolute)) {
        images.set(absolute, {
          src: absolute,
          alt: $(el).attr('alt') || '',
          width: $(el).attr('width') || null,
          height: $(el).attr('height') || null,
        });
      }
    } catch {
      // invalid URL, skip
    }
  });

  return {
    images: Array.from(images.values()),
    count: images.size,
  };
}

function extractHeadings($) {
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (text) {
      headings.push({ level: parseInt(tag.charAt(1)), tag, text });
    }
  });
  return headings;
}

function extractText($) {
  // Remove script/style elements
  $('script, style, noscript, iframe, svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text;
}

function extractStructuredText($) {
  const blocks = [];
  $('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (text && text.length > 1) {
      blocks.push({ tag, text });
    }
  });
  return blocks;
}

async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  return {
    text: data.text.trim(),
    pages: data.numpages,
    info: data.info,
  };
}

async function scrapeArticle(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const article = extractArticle(html, url);
  const metadata = extractMetadata($, url);

  if (!article) {
    return {
      url,
      mode: 'article',
      title: metadata.title,
      summary: metadata.description,
      status: 'success',
      result: {
        message: 'Readability could not extract an article from this page. Showing metadata instead.',
        metadata,
        links: extractLinks($, url),
      },
    };
  }

  return {
    url,
    mode: 'article',
    title: article.title || metadata.title,
    summary: article.excerpt || metadata.description,
    status: 'success',
    result: {
      article,
      metadata,
    },
  };
}

async function scrapeText(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const metadata = extractMetadata($, url);
  $('script, style, noscript, iframe, svg').remove();
  const fullText = extractText($);
  const structured = extractStructuredText($);
  const headings = extractHeadings($);

  return {
    url,
    mode: 'text',
    title: metadata.title,
    summary: metadata.description || fullText.slice(0, 200),
    status: 'success',
    result: {
      fullText,
      textLength: fullText.length,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
      structured,
      headings,
      metadata,
    },
  };
}

async function scrapeLinks(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const metadata = extractMetadata($, url);
  const links = extractLinks($, url);

  return {
    url,
    mode: 'links',
    title: metadata.title,
    summary: `Found ${links.count} links (${links.internalCount} internal, ${links.externalCount} external)`,
    status: 'success',
    result: {
      links,
      metadata,
    },
  };
}

async function scrapeImages(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const metadata = extractMetadata($, url);
  const images = extractImages($, url);

  return {
    url,
    mode: 'images',
    title: metadata.title,
    summary: `Found ${images.count} images`,
    status: 'success',
    result: {
      images,
      metadata,
    },
  };
}

async function scrapeMetadata(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const metadata = extractMetadata($, url);
  const headings = extractHeadings($);
  const stats = {
    linkCount: $('a').length,
    imageCount: $('img').length,
    scriptCount: $('script').length,
    styleCount: $('style').length,
    formCount: $('form').length,
    tableCount: $('table').length,
    headingCount: headings.length,
  };

  return {
    url,
    mode: 'metadata',
    title: metadata.title,
    summary: metadata.description,
    status: 'success',
    result: {
      metadata,
      headings,
      stats,
    },
  };
}

async function scrapePdf(url) {
  const response = await fetchPage(url);
  const pdfData = await extractPdfText(response.data);

  return {
    url,
    mode: 'pdf',
    title: pdfData.info?.Title || 'PDF Document',
    summary: pdfData.text.slice(0, 200),
    status: 'success',
    result: pdfData,
  };
}

async function scrapeFull(url) {
  const response = await fetchPage(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const article = extractArticle(html, url);
  const metadata = extractMetadata($, url);
  const links = extractLinks($, url);
  const images = extractImages($, url);
  const headings = extractHeadings($);
  const fullText = extractText($);

  return {
    url,
    mode: 'full',
    title: article?.title || metadata.title || url,
    summary: article?.excerpt || metadata.description || fullText.slice(0, 200),
    status: 'success',
    result: {
      article,
      metadata,
      links,
      images,
      headings,
      fullText,
      textLength: fullText.length,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
    },
  };
}

export async function scrape(url, mode) {
  const normalizedUrl = normalizeUrl(url);

  if (isPdfUrl(normalizedUrl) && (mode === 'pdf' || mode === 'full')) {
    return scrapePdf(normalizedUrl);
  }
  if (isPdfUrl(normalizedUrl) && mode !== 'pdf') {
    return {
      url: normalizedUrl,
      mode,
      title: 'PDF Document',
      summary: 'URL points to a PDF. Use PDF mode for text extraction.',
      status: 'error',
      result: null,
      error: 'URL is a PDF file. Switch to PDF mode to extract text from it.',
    };
  }

  switch (mode) {
    case 'article':
      return scrapeArticle(normalizedUrl);
    case 'text':
      return scrapeText(normalizedUrl);
    case 'links':
      return scrapeLinks(normalizedUrl);
    case 'images':
      return scrapeImages(normalizedUrl);
    case 'metadata':
      return scrapeMetadata(normalizedUrl);
    case 'pdf':
      return scrapePdf(normalizedUrl);
    case 'full':
      return scrapeFull(normalizedUrl);
    default:
      throw new Error(`Unknown scrape mode: ${mode}`);
  }
}

export async function scrapeRecursive(url, maxDepth = 1, maxPages = 10) {
  const normalizedUrl = normalizeUrl(url);
  const visited = new Set();
  const results = [];
  const queue = [{ url: normalizedUrl, depth: 0 }];

  while (queue.length > 0 && results.length < maxPages) {
    const { url: currentUrl, depth } = queue.shift();
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const response = await fetchPage(currentUrl);
      const html = response.data;
      const $ = cheerio.load(html);
      const text = extractText($);
      const metadata = extractMetadata($, url);

      results.push({
        url: currentUrl,
        title: metadata.title,
        textLength: text.length,
        textPreview: text.slice(0, 500),
      });

      if (depth < maxDepth) {
        const links = extractLinks($, currentUrl);
        for (const link of links.internal) {
          if (!visited.has(link) && !queue.some((q) => q.url === link)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    } catch (err) {
      results.push({
        url: currentUrl,
        error: err.message,
      });
    }
  }

  return {
    url: normalizedUrl,
    mode: 'full',
    title: `Recursive crawl of ${new URL(normalizedUrl).hostname}`,
    summary: `Crawled ${results.length} pages up to depth ${maxDepth}`,
    status: 'success',
    result: {
      pages: results,
      totalPages: results.length,
      maxDepth,
      visitedCount: visited.size,
    },
  };
}
