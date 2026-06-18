import { Router } from 'express';
import { readOptionalAuth, requireAuth } from '../middleware/auth.js';
import { createAuthToken, isAuthConfigured, verifyLogin } from '../services/auth.js';
import { readUserBackup, writeUserBackup } from '../storage/userBackup.js';

const router = Router();

router.get('/status', async (req, res) => {
  if (!(await isAuthConfigured())) {
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
    username: auth.username,
  });
});

router.post('/login', async (req, res) => {
  if (!(await isAuthConfigured())) {
    res.status(503).json({
      error: 'Accounts are not configured. Create backend/data/accounts.json.',
    });
    return;
  }

  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username.trim() || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const verified = await verifyLogin(username, password);
  if (!verified.valid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const session = createAuthToken(verified.username);
  res.json(session);
});

router.get('/backup', requireAuth, async (req, res) => {
  const username = req.auth!.username;
  const backup = await readUserBackup(username);
  if (!backup) {
    res.json({ exists: false, backup: null });
    return;
  }

  res.json({ exists: true, backup });
});

router.put('/backup', requireAuth, async (req, res) => {
  const username = req.auth!.username;
  const body = req.body;

  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    res.status(400).json({ error: 'Invalid backup payload' });
    return;
  }

  const saved = await writeUserBackup(username, {
    version: Number(body.version ?? 1),
    updatedAt: new Date().toISOString(),
    data: body.data as Record<string, unknown>,
  });

  res.json({ backup: saved });
});

export default router;
