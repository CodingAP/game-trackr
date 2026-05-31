import type { Request, RequestHandler, Response } from 'express';
import { isAuthConfigured, verifyAuthToken } from '../services/auth.js';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Admin password is not configured. Set ADMIN_PASSWORD in .env.' });
    return;
  }

  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const result = verifyAuthToken(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }

  next();
}

export function readOptionalAuth(req: Request): { valid: true; expiresAt: string } | { valid: false } {
  const token = readBearerToken(req);
  if (!token) return { valid: false };
  return verifyAuthToken(token);
}
