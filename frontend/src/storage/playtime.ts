import type { GamePlaytime, PlaytimeEntry } from '../types/index.js';
import { notifyLocalDataChanged } from './localDataEvents.js';

const STORAGE_KEY = 'game-tracking:playtime';

function readAll(): GamePlaytime[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GamePlaytime[];
  } catch {
    return [];
  }
}

function writeAll(records: GamePlaytime[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  notifyLocalDataChanged();
}

export function getPlaytime(gameSlug: string): GamePlaytime {
  const existing = readAll().find((entry) => entry.gameSlug === gameSlug);
  if (existing) return existing;

  return {
    gameSlug,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
}

function savePlaytime(record: GamePlaytime): GamePlaytime {
  const all = readAll();
  const index = all.findIndex((entry) => entry.gameSlug === record.gameSlug);
  const updated = {
    ...record,
    entries: [...record.entries],
    updatedAt: new Date().toISOString(),
  };

  if (index === -1) {
    all.push(updated);
  } else {
    all[index] = updated;
  }

  writeAll(all);
  return updated;
}

export function addPlaytimeEntry(
  gameSlug: string,
  entry: Omit<PlaytimeEntry, 'id'>,
): GamePlaytime {
  const record = getPlaytime(gameSlug);
  record.entries.push({
    id: crypto.randomUUID(),
    playedAt: entry.playedAt,
    durationMinutes: entry.durationMinutes,
  });
  return savePlaytime(record);
}

export function removePlaytimeEntry(gameSlug: string, entryId: string): GamePlaytime {
  const record = getPlaytime(gameSlug);
  record.entries = record.entries.filter((entry) => entry.id !== entryId);
  return savePlaytime(record);
}

export function getTotalPlaytimeMinutes(entries: PlaytimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.durationMinutes, 0);
}
