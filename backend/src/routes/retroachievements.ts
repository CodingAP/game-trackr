import { Router } from 'express';
import { isRetroAchievementsConfigured } from '../services/retroachievements.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ configured: isRetroAchievementsConfigured() });
});

export default router;
