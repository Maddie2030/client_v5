import type { ScrapeMode } from '@/types';
import {
  FileText,
  Type,
  Link2,
  Image as ImageIcon,
  Tags,
  FileSearch,
  Layers,
} from 'lucide-react';

export interface ModeConfig {
  id: ScrapeMode;
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
}

export const SCRAPE_MODES: ModeConfig[] = [
  {
    id: 'article',
    label: 'Article (Reader Mode)',
    description: 'Extract the main article using Mozilla Readability — clean text without ads, nav, or clutter.',
    icon: FileText,
    color: 'primary',
  },
  {
    id: 'text',
    label: 'Full Text',
    description: 'Extract all text content from the page body, including structured blocks and headings.',
    icon: Type,
    color: 'accent',
  },
  {
    id: 'links',
    label: 'Links',
    description: 'Find all hyperlinks on the page, categorized as internal vs external.',
    icon: Link2,
    color: 'primary',
  },
  {
    id: 'images',
    label: 'Images',
    description: 'Collect all images on the page with their alt text and dimensions.',
    icon: ImageIcon,
    color: 'accent',
  },
  {
    id: 'metadata',
    label: 'Metadata & SEO',
    description: 'Extract page title, meta tags, Open Graph, Twitter Cards, and heading structure.',
    icon: Tags,
    color: 'primary',
  },
  {
    id: 'pdf',
    label: 'PDF Text',
    description: 'Download a PDF from a URL and extract its text content page by page.',
    icon: FileSearch,
    color: 'accent',
  },
  {
    id: 'full',
    label: 'Full Page Analysis',
    description: 'Everything: article, metadata, links, images, headings, and text in one comprehensive result.',
    icon: Layers,
    color: 'primary',
  },
];

export const MODE_MAP: Record<ScrapeMode, ModeConfig> = SCRAPE_MODES.reduce(
  (acc, m) => ({ ...acc, [m.id]: m }),
  {} as Record<ScrapeMode, ModeConfig>
);
