import {
  BACKUP_VERSION,
  exportLocalData,
  importLocalData,
  type LocalDataBackup,
} from './backup.js';
import { getStoredAuth, isLocallyAuthenticated } from './auth.js';

const SYNC_DEBOUNCE_MS = 1000;

let syncTimer: number | null = null;
let syncInFlight: Promise<void> | null = null;
let applyingCloudData = false;

export interface CloudBackupResponse {
  exists: boolean;
  backup: LocalDataBackup | null;
}

async function fetchCloudBackup(): Promise<CloudBackupResponse> {
  const session = getStoredAuth();
  if (!session) {
    return { exists: false, backup: null };
  }

  const response = await fetch('/api/auth/backup', {
    headers: { Authorization: `Bearer ${session.token}` },
  });

  if (response.status === 401) {
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Failed to load cloud backup');
  }

  return response.json() as Promise<CloudBackupResponse>;
}

async function uploadCloudBackup(backup: LocalDataBackup): Promise<void> {
  const session = getStoredAuth();
  if (!session) return;

  const response = await fetch('/api/auth/backup', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backup),
  });

  if (response.status === 401) {
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Failed to save cloud backup');
  }
}

function hasLocalData(backup: LocalDataBackup): boolean {
  return Object.keys(backup.data).length > 0;
}

export function isApplyingCloudData(): boolean {
  return applyingCloudData;
}

export async function pullCloudBackupToLocal(): Promise<'applied' | 'uploaded' | 'empty'> {
  if (!isLocallyAuthenticated()) return 'empty';

  const cloud = await fetchCloudBackup();
  const local = exportLocalData();

  if (cloud.exists && cloud.backup && hasLocalData(cloud.backup)) {
    applyingCloudData = true;
    try {
      importLocalData(JSON.stringify(cloud.backup), { replaceMissingKeys: true });
    } finally {
      applyingCloudData = false;
    }
    window.dispatchEvent(new CustomEvent('game-trackr:local-data-changed'));
    return 'applied';
  }

  if (hasLocalData(local)) {
    await uploadCloudBackup(local);
    return 'uploaded';
  }

  return 'empty';
}

export function scheduleCloudSync(): void {
  if (!isLocallyAuthenticated() || applyingCloudData) return;

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }

  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void flushCloudSync();
  }, SYNC_DEBOUNCE_MS);
}

export async function flushCloudSync(): Promise<void> {
  if (!isLocallyAuthenticated() || applyingCloudData) return;

  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    const backup = exportLocalData();
    backup.version = BACKUP_VERSION;
    backup.exportedAt = new Date().toISOString();
    await uploadCloudBackup(backup);
  })().finally(() => {
    syncInFlight = null;
  });

  await syncInFlight;
}

export async function initCloudSync(): Promise<void> {
  if (!isLocallyAuthenticated()) return;

  try {
    await pullCloudBackupToLocal();
  } catch (error) {
    console.warn('Cloud sync failed on startup:', error);
  }
}
