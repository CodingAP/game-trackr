import type { GameNotes } from '../types/index.js';

const STORAGE_KEY = 'game-tracking:notes';

function readAll(): GameNotes[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameNotes[];
  } catch {
    return [];
  }
}

function writeAll(records: GameNotes[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getNotes(gameSlug: string): GameNotes {
  const existing = readAll().find((entry) => entry.gameSlug === gameSlug);
  if (existing) return existing;

  return {
    gameSlug,
    content: '',
    updatedAt: new Date().toISOString(),
  };
}

export function saveNotes(gameSlug: string, content: string): GameNotes {
  const all = readAll();
  const index = all.findIndex((entry) => entry.gameSlug === gameSlug);
  const updated: GameNotes = {
    gameSlug,
    content,
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
