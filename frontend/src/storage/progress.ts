import type { UserProgress } from '../types/index.js';

const STORAGE_KEY = 'game-tracking:progress';

function readAll(): UserProgress[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserProgress[];
  } catch {
    return [];
  }
}

function writeAll(progress: UserProgress[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getProgress(gameSlug: string): UserProgress {
  const existing = readAll().find((entry) => entry.gameSlug === gameSlug);
  if (existing) return existing;

  return {
    gameSlug,
    checkedItems: {},
    stats: {},
    updatedAt: new Date().toISOString(),
  };
}

export function saveProgress(progress: UserProgress): void {
  const all = readAll();
  const index = all.findIndex((entry) => entry.gameSlug === progress.gameSlug);
  const updated = { ...progress, updatedAt: new Date().toISOString() };

  if (index === -1) {
    all.push(updated);
  } else {
    all[index] = updated;
  }

  writeAll(all);
}

export function setCheckboxStates(
  gameSlug: string,
  updates: Record<string, boolean>,
): UserProgress {
  const progress = getProgress(gameSlug);
  for (const [itemId, checked] of Object.entries(updates)) {
    progress.checkedItems[itemId] = checked;
  }
  saveProgress(progress);
  return progress;
}
