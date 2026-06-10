import { applyTheme, getTheme } from './settings.js';

export const LOCAL_STORAGE_KEYS = [
  'game-tracking:progress',
  'game-tracking:playtime',
  'game-tracking:notes',
  'game-tracking:theme',
  'game-tracking:image-viewport',
] as const;

export const BACKUP_VERSION = 1;

export interface LocalDataBackup {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

function readStoredValue(key: string): unknown | undefined {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function writeStoredValue(key: string, value: unknown): void {
  if (typeof value === 'string') {
    localStorage.setItem(key, value);
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

export function exportLocalData(): LocalDataBackup {
  const data: Record<string, unknown> = {};

  for (const key of LOCAL_STORAGE_KEYS) {
    const value = readStoredValue(key);
    if (value !== undefined) {
      data[key] = value;
    }
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function exportLocalDataJson(pretty = true): string {
  const backup = exportLocalData();
  return pretty ? JSON.stringify(backup, null, 2) : JSON.stringify(backup);
}

export function parseLocalDataBackup(json: string): LocalDataBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file format.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return {
      version: Number(record.version ?? BACKUP_VERSION),
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
      data: record.data as Record<string, unknown>,
    };
  }

  const data: Record<string, unknown> = {};
  for (const key of LOCAL_STORAGE_KEYS) {
    if (key in record) {
      data[key] = record[key];
    }
  }

  if (Object.keys(data).length === 0) {
    throw new Error('No recognized GameTrackr data found in file.');
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function importLocalData(json: string): string[] {
  const backup = parseLocalDataBackup(json);
  const importedKeys: string[] = [];

  for (const key of LOCAL_STORAGE_KEYS) {
    if (!(key in backup.data)) continue;
    const value = backup.data[key];
    if (value === undefined || value === null) continue;
    writeStoredValue(key, value);
    importedKeys.push(key);
  }

  if (importedKeys.length === 0) {
    throw new Error('No recognized GameTrackr data found in file.');
  }

  if (importedKeys.includes('game-tracking:theme')) {
    applyTheme(getTheme());
  }

  return importedKeys;
}

export function downloadLocalDataBackup(): void {
  const json = exportLocalDataJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gametrackr-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function describeBackupContents(keys: string[]): string {
  const labels: Record<string, string> = {
    'game-tracking:progress': 'checkbox progress',
    'game-tracking:playtime': 'playtime logs',
    'game-tracking:notes': 'notes',
    'game-tracking:theme': 'theme',
    'game-tracking:image-viewport': 'media viewport settings',
  };

  return keys.map((key) => labels[key] ?? key).join(', ');
}
