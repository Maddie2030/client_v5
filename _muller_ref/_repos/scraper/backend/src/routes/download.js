import { Router } from 'express';
import archiver from 'archiver';
import axios from 'axios';
import { URL } from 'node:url';

const router = Router();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TIMEOUT = 15000;
const MAX_IMAGES = 250;

router.post('/images-zip', async (req, res, next) => {
  try {
    const { images, sourceUrl } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const limited = images.slice(0, MAX_IMAGES);
    const hostname = sourceUrl ? (() => { try { return new URL(sourceUrl).hostname; } catch { return 'scrape'; } })() : 'scrape';
    const zipName = `${hostname}-images.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip' });
      }
    });
    archive.pipe(res);

    let added = 0;
    for (const img of limited) {
      const src = typeof img === 'string' ? img : img.src;
      if (!src) continue;

      try {
        const response = await axios.get(src, {
          headers: { 'User-Agent': USER_AGENT, Referer: sourceUrl || '' },
          timeout: TIMEOUT,
          maxRedirects: 3,
          responseType: 'arraybuffer',
        });

        const contentType = response.headers['content-type'] || '';
        if (!contentType.startsWith('image/')) continue;

        const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
        const filename = `image-${String(added + 1).padStart(3, '0')}.${ext}`;

        archive.append(response.data, { name: filename });
        added++;
      } catch (err) {
        // skip failed downloads
        console.error(`Failed to download image: ${src} — ${err.message}`);
      }
    }

    if (added === 0) {
      // If no images were downloaded, add a readme
      archive.append('No images could be downloaded. The image URLs may be blocked or require authentication.', { name: 'README.txt' });
    }

    await archive.finalize();
  } catch (err) {
    next(err);
  }
});

export default router;
