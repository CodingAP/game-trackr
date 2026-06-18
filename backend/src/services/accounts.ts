import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ACCOUNTS_PATH = path.resolve(__dirname, '../../data/accounts.json');

export interface AccountRecord {
  username: string;
  password: string;
}

let cachedAccounts: AccountRecord[] | null = null;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function passwordsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function readAccountsFile(): Promise<AccountRecord[]> {
  try {
    const raw = await fs.readFile(ACCOUNTS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is AccountRecord =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as AccountRecord).username === 'string' &&
          typeof (entry as AccountRecord).password === 'string',
      )
      .map((entry) => ({
        username: normalizeUsername(entry.username),
        password: entry.password,
      }))
      .filter((entry) => entry.username.length > 0 && entry.password.length > 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function loadAccounts(force = false): Promise<AccountRecord[]> {
  if (!force && cachedAccounts) return cachedAccounts;

  cachedAccounts = await readAccountsFile();
  return cachedAccounts;
}

export async function isAccountsConfigured(): Promise<boolean> {
  const accounts = await loadAccounts();
  return accounts.length > 0;
}

export async function verifyAccountCredentials(
  username: string,
  password: string,
): Promise<{ valid: true; username: string } | { valid: false }> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) return { valid: false };

  const accounts = await loadAccounts();
  const account = accounts.find((entry) => entry.username === normalizedUsername);
  if (!account) return { valid: false };

  if (!passwordsMatch(password, account.password)) {
    return { valid: false };
  }

  return { valid: true, username: account.username };
}

export function invalidateAccountsCache(): void {
  cachedAccounts = null;
}
