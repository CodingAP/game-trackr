import { Router } from 'express';
import { readOptionalAuth } from '../middleware/auth.js';
import { createAuthToken, isAuthConfigured, verifyPassword } from '../services/auth.js';

const router = Router();

router.get('/status', (req, res) => {
  if (!isAuthConfigured()) {
    res.json({ configured: false, authenticated: false });
    return;
  }

  const auth = readOptionalAuth(req);
  if (!auth.valid) {
    res.json({ configured: true, authenticated: false });
    return;
  }

  res.json({
    configured: true,
    authenticated: true,
    expiresAt: auth.expiresAt,
  });
});

router.post('/login', (req, res) => {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Admin password is not configured. Set ADMIN_PASSWORD in .env.' });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  if (!verifyPassword(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const session = createAuthToken();
  res.json(session);
});

export default router;
