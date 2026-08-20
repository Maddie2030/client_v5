import { Router } from 'express';
import ScrapeHistory from '../models/ScrapeHistory.js';

const router = Router();

// Get saved scrape records (only saved=true)
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const mode = req.query.mode;
    const parentsOnly = req.query.parentsOnly === 'true';

    const query = { saved: true };
    if (mode) query.mode = mode;
    if (parentsOnly) query.parentId = null;

    const history = await ScrapeHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-result')
      .lean();

    // Attach child counts for parent records
    const historyWithChildren = await Promise.all(
      history.map(async (entry) => {
        if (!entry.parentId) {
          const childCount = await ScrapeHistory.countDocuments({ parentId: entry._id, saved: true });
          return { ...entry, childCount };
        }
        return { ...entry, childCount: 0 };
      })
    );

    res.json({ history: historyWithChildren, count: historyWithChildren.length });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const entry = await ScrapeHistory.findById(req.params.id).lean();
    if (!entry) {
      return res.status(404).json({ error: 'History entry not found' });
    }

    // If this is a parent, also fetch its children
    let children = [];
    if (!entry.parentId) {
      children = await ScrapeHistory.find({ parentId: entry._id, saved: true })
        .sort({ position: 1, createdAt: 1 })
        .select('-result')
        .lean();
    }

    res.json({ ...entry, children });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await ScrapeHistory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    // Also delete children if this was a parent
    if (!deleted.parentId) {
      await ScrapeHistory.deleteMany({ parentId: req.params.id });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await ScrapeHistory.deleteMany({});
    res.json({ success: true, message: 'All history cleared' });
  } catch (err) {
    next(err);
  }
});

export default router;
