import type { Request, RequestHandler } from 'express';
import { isAuthConfigured, verifyAuthToken } from '../services/auth.js';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export type AuthContext = { valid: true; expiresAt: string; username: string } | { valid: false };

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!(await isAuthConfigured())) {
    res.status(503).json({
      error: 'Accounts are not configured. Create backend/data/accounts.json.',
    });
    return;
  }

  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const result = verifyAuthToken(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Invalid or expired session. Sign in again.' });
    return;
  }

  req.auth = result;
  next();
};

export function readOptionalAuth(req: Request): AuthContext {
  const token = readBearerToken(req);
  if (!token) return { valid: false };
  return verifyAuthToken(token);
}

declare global {
  namespace Express {
    interface Request {
      auth?: Extract<AuthContext, { valid: true }>;
    }
  }
}
