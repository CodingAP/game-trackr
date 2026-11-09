import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isAccountsConfigured, verifyAccountCredentials } from './accounts.js';

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// Fallback secret used only when AUTH_TOKEN_SECRET is not set. It is generated
// fresh on every process start, so sessions are invalidated on restart. Set
// AUTH_TOKEN_SECRET in production for stable sessions.
let ephemeralTokenSecret: string | null = null;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export async function isAuthConfigured(): Promise<boolean> {
  return isAccountsConfigured();
}

function getTokenSecret(): string {
  const configured = process.env.AUTH_TOKEN_SECRET?.trim();
  if (configured) return configured;

  if (!ephemeralTokenSecret) {
    ephemeralTokenSecret = randomBytes(32).toString('hex');
    console.warn(
      'Warning: AUTH_TOKEN_SECRET is not set. Using a random secret for this process; sessions will not survive a restart.',
    );
  }
  return ephemeralTokenSecret;
}

export async function verifyLogin(
  username: string,
  password: string,
): Promise<{ valid: true; username: string } | { valid: false }> {
  return verifyAccountCredentials(username, password);
}

export function createAuthToken(username: string): { token: string; expiresAt: string; username: string } {
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const payload = base64UrlEncode(JSON.stringify({ exp: expiresAtMs, sub: username }));
  const signature = createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    username,
  };
}

export function verifyAuthToken(
  token: string,
): { valid: true; expiresAt: string; username: string } | { valid: false } {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return { valid: false };

  const expectedSignature = createHmac('sha256', getTokenSecret())
    .update(payloadPart)
    .digest('base64url');

  const provided = Buffer.from(signaturePart, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as { exp?: number; sub?: string };
    if (!payload.exp || payload.exp <= Date.now() || !payload.sub?.trim()) {
      return { valid: false };
    }

    return {
      valid: true,
      expiresAt: new Date(payload.exp).toISOString(),
      username: payload.sub.trim().toLowerCase(),
    };
  } catch {
    return { valid: false };
  }
}
