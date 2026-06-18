import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const USERS_DIR = path.resolve(__dirname, '../../data/users');

export const LOCAL_DATA_KEYS = [
  'game-tracking:progress',
  'game-tracking:playtime',
  'game-tracking:notes',
  'game-tracking:theme',
  'game-tracking:hide-images',
  'game-tracking:image-viewport',
  'game-tracking:library-folders',
] as const;

export const BACKUP_VERSION = 1;

export interface UserLocalDataBackup {
  version: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

function userDir(username: string): string {
  return path.join(USERS_DIR, username);
}

function backupPath(username: string): string {
  return path.join(userDir(username), 'local-data.json');
}

function normalizeBackup(value: unknown): UserLocalDataBackup | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (!record.data || typeof record.data !== 'object') return null;

  const data: Record<string, unknown> = {};
  for (const key of LOCAL_DATA_KEYS) {
    if (key in (record.data as Record<string, unknown>)) {
      data[key] = (record.data as Record<string, unknown>)[key];
    }
  }

  return {
    version: Number(record.version ?? BACKUP_VERSION),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    data,
  };
}

export async function readUserBackup(username: string): Promise<UserLocalDataBackup | null> {
  try {
    const raw = await fs.readFile(backupPath(username), 'utf8');
    return normalizeBackup(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeUserBackup(
  username: string,
  backup: UserLocalDataBackup,
): Promise<UserLocalDataBackup> {
  const normalized = normalizeBackup(backup);
  if (!normalized) {
    throw new Error('Invalid backup payload');
  }

  await fs.mkdir(userDir(username), { recursive: true });
  const payload: UserLocalDataBackup = {
    version: BACKUP_VERSION,
    updatedAt: new Date().toISOString(),
    data: normalized.data,
  };

  await fs.writeFile(backupPath(username), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}
