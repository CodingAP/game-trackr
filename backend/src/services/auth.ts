import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? '';
}

function getTokenSecret(): string {
  const configured = process.env.AUTH_TOKEN_SECRET?.trim();
  if (configured) return configured;

  const password = getAdminPassword();
  return createHmac('sha256', password).update('game-trackr-auth').digest('hex');
}

export function verifyPassword(password: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;

  const provided = Buffer.from(password, 'utf8');
  const target = Buffer.from(expected, 'utf8');
  if (provided.length !== target.length) {
    timingSafeEqual(target, target);
    return false;
  }

  return timingSafeEqual(provided, target);
}

export function createAuthToken(): { token: string; expiresAt: string } {
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const payload = base64UrlEncode(JSON.stringify({ exp: expiresAtMs }));
  const signature = createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');
  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyAuthToken(token: string): { valid: true; expiresAt: string } | { valid: false } {
  if (!isAuthConfigured()) return { valid: false };

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
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as { exp?: number };
    if (!payload.exp || payload.exp <= Date.now()) {
      return { valid: false };
    }

    return { valid: true, expiresAt: new Date(payload.exp).toISOString() };
  } catch {
    return { valid: false };
  }
}
