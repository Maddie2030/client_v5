export type ScrapeMode = 'article' | 'text' | 'links' | 'images' | 'metadata' | 'pdf' | 'full';

export interface ScrapeMetadata {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  ogType: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterImage: string | null;
  keywords: string | null;
  author: string | null;
  canonical: string | null;
  lang: string | null;
  favicon: string | null;
}

export interface ArticleResult {
  title: string | null;
  byline: string | null;
  dir: string | null;
  content: string | null;
  textContent: string | null;
  length: number;
  excerpt: string | null;
  siteName: string | null;
  readingTimeMinutes: number;
}

export interface LinkResult {
  all: string[];
  internal: string[];
  external: string[];
  count: number;
  internalCount: number;
  externalCount: number;
}

export interface ImageItem {
  src: string;
  alt: string;
  width: string | null;
  height: string | null;
}

export interface ImageResult {
  images: ImageItem[];
  count: number;
}

export interface HeadingItem {
  level: number;
  tag: string;
  text: string;
}

export interface TextBlock {
  tag: string;
  text: string;
}

export interface PdfResult {
  text: string;
  pages: number;
  info: Record<string, unknown> | null;
}

export interface PageStats {
  linkCount: number;
  imageCount: number;
  scriptCount: number;
  styleCount: number;
  formCount: number;
  tableCount: number;
  headingCount: number;
}

export interface ScrapeResultData {
  message?: string;
  article?: ArticleResult | null;
  metadata?: ScrapeMetadata;
  links?: LinkResult;
  images?: ImageResult;
  headings?: HeadingItem[];
  fullText?: string;
  textLength?: number;
  wordCount?: number;
  structured?: TextBlock[];
  stats?: PageStats;
  text?: string;
  pages?: number;
  info?: Record<string, unknown> | null;
  pages_crawled?: Array<{ url: string; title?: string; textLength?: number; textPreview?: string; error?: string }>;
  totalPages?: number;
  maxDepth?: number;
  visitedCount?: number;
}

export interface ScrapeResponse {
  id?: string;
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: 'success' | 'error';
  result: ScrapeResultData | null;
  error?: string;
}

export interface HistoryEntry {
  _id: string;
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: string;
  error: string | null;
  parentId: string | null;
  position: number | null;
  editedImages: ImageItem[] | null;
  editedText: EditableTextField[] | null;
  saved: boolean;
  childCount?: number;
  createdAt: string;
}

export interface HistoryEntryDetail extends HistoryEntry {
  result: ScrapeResultData | null;
  children: HistoryEntry[];
}

export interface HistoryResponse {
  history: HistoryEntry[];
  count: number;
}

export interface ScrapeRequest {
  url: string;
  mode: ScrapeMode;
  recursive?: boolean;
  maxDepth?: number;
  maxPages?: number;
}

export interface SaveRequest {
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: 'success' | 'error';
  result: ScrapeResultData | null;
  error?: string;
  parentId?: string | null;
  editedImages?: ImageItem[] | null;
  editedText?: EditableTextField[] | null;
}

export interface EditableTextField {
  id: string;
  key: string;
  value: string;
}

export interface SaveResponse {
  success: boolean;
  id: string;
  entry: HistoryEntry;
}
