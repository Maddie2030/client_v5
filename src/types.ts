export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Genre {
  id: number;
  name: string;
}

export type SeriesStatus = 'ongoing' | 'completed' | 'hiatus';

export interface Series {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_path: string | null;
  status: SeriesStatus;
  created_at: string;
  updated_at: string;
}

export interface SeriesWithGenres extends Series {
  genres: Genre[];
  chapter_count: number;
}

export type ChapterStatus = 'draft' | 'published';

export interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  slug: string;
  status: ChapterStatus;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  chapter_id: string;
  page_number: number;
  image_path: string;
  width: number | null;
  height: number | null;
}

export interface ChapterWithPages extends Chapter {
  pages: Page[];
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  chapter_id: string;
  last_page: number;
  scroll_position: number;
  updated_at: string;
}

export interface ReadingHistory {
  id: string;
  user_id: string;
  series_id: string;
  chapter_id: string;
  read_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  series_id: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  series_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  series_id: string | null;
  chapter_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  series_id: string;
  chapter_id: string | null;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  username?: string;
  children?: Comment[];
}

export type ScrapeMode = 'article' | 'text' | 'links' | 'images' | 'metadata' | 'pdf' | 'full';
export type ScrapeStatus = 'success' | 'error';

export interface ImageItem {
  src: string;
  alt: string;
  width: string | number | null;
  height: string | number | null;
}

export interface EditableTextField {
  id: string;
  key: string;
  value: string;
}

export interface ScrapeResult {
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: ScrapeStatus;
  result: Record<string, unknown> | null;
  error?: string | null;
}

export interface ScrapeRecord {
  id: string;
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: ScrapeStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  parent_id: string | null;
  position: number | null;
  unique_key: string | null;
  edited_text: EditableTextField[] | null;
  edited_images: ImageItem[] | null;
  saved: boolean;
  synced: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapeRecordSummary {
  id: string;
  url: string;
  mode: ScrapeMode;
  title: string | null;
  summary: string | null;
  status: ScrapeStatus;
  parent_id: string | null;
  position: number | null;
  unique_key: string | null;
  saved: boolean;
  synced: boolean;
  created_at: string;
}
