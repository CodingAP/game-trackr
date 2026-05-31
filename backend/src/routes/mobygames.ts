import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { isMobyGamesConfigured, searchMobyGames } from '../services/mobygames.js';

const router = Router();

router.get('/search', requireAuth, async (req, res) => {
  if (!isMobyGamesConfigured()) {
    res.status(503).json({ error: 'MobyGames API key is not configured. Set MOBYGAMES_API_KEY.' });
    return;
  }

  const title = typeof req.query.title === 'string' ? req.query.title : '';
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;

  if (!title.trim()) {
    res.status(400).json({ error: 'title query parameter is required' });
    return;
  }

  try {
    const results = await searchMobyGames(title, Number.isFinite(limit) ? limit : 20);
    res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MobyGames search failed';
    res.status(502).json({ error: message });
  }
});

router.get('/status', (_req, res) => {
  res.json({ configured: isMobyGamesConfigured() });
});

export default router;
